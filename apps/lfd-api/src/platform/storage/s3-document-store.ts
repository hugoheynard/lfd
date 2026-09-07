import { Injectable, Logger } from "@nestjs/common";
import { S3StorageService } from "@lfd/storage";

import { DocumentStorageUnavailableError } from "../shared/errors/storage-errors.js";
import { AppConfig } from "../config/app-config.js";
import type { R2StorageUsage } from "../config/env-readers.js";
import { DocumentStore, type StoredDocument } from "./document-store.js";

/**
 * Adaptateur **R2/S3** du stockage de pièces (`@lfd/storage`).
 *
 * Le service S3 n'est construit qu'à la première pièce, et seulement si le
 * bucket est configuré ; sinon `service()` refuse **clairement** plutôt que
 * d'échouer sur une erreur AWS obscure. Le reste de l'app démarre sans stockage
 * — seules les pièces sont indisponibles (cf. `AppConfig.storageConfig`).
 *
 * 🔴 **L'usage est un paramètre, plus une constante.** Il valait `"kbis"` en
 * dur, et tout ce qui passait par ce port atterrissait donc dans le bucket des
 * pièces d'identité, avec ses clés. La configuration dit pourtant l'inverse en
 * toutes lettres : « chaque usage porte son bucket ET ses clés : un jeton
 * n'ouvre que le sien ». Une constante en dur défaisait l'isolation que la
 * configuration établissait.
 */
@Injectable()
export class S3DocumentStore extends DocumentStore {
  private readonly logger = new Logger(S3DocumentStore.name);
  private cached: S3StorageService | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly usage: R2StorageUsage,
  ) {
    super();
  }

  async save(key: string, document: StoredDocument): Promise<string> {
    await this.attempt("dépôt", key, () =>
      this.service().upload(key, document.bytes, document.contentType),
    );
    return key;
  }

  read(key: string): Promise<Buffer> {
    return this.attempt("lecture", key, () => this.service().downloadToBuffer(key));
  }

  async readIfPresent(key: string): Promise<Buffer | null> {
    try {
      return await this.attempt("lecture", key, () => this.service().downloadToBuffer(key));
    } catch (error) {
      // Seule l'ABSENCE devient `null`. Une clé refusée, un bucket inconnu, une
      // signature invalide continuent de lever : ce sont des pannes, et les
      // confondre avec « pas encore rangé » ferait refabriquer en silence pour
      // toujours devant un stockage cassé.
      if (isMissingObject(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Exécute une opération de stockage, et **catégorise ses pannes**.
   *
   * Le port promet `DocumentStorageUnavailableError` pour un stockage « non
   * configuré **ou en échec** » ; seul le premier cas était traité. Une erreur
   * du SDK S3 remontait donc telle quelle jusqu'au filtre, qui la rendait en
   * `internal.unexpected` — le code réservé à ce qu'on n'a PAS prévu. Un bucket
   * absent ou une clé refusée sont pourtant des pannes ordinaires du canal, et
   * les confondre avec un bug a coûté une soirée de diagnostic : le seul indice
   * disponible depuis l'extérieur disait « erreur inattendue » là où il fallait
   * lire « le stockage refuse ».
   *
   * Le **nom** de l'erreur S3 est tracé (`NoSuchBucket`, `InvalidAccessKeyId`,
   * `SignatureDoesNotMatch`…) : c'est lui qui distingue les trois pannes, et il
   * ne dit rien du contenu de la pièce. Il ne repart pas au client — cette
   * surface sert aussi les clients, et le nom de nos buckets ne les regarde pas.
   */
  private async attempt<T>(what: string, key: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      // Le refus « non configuré » porte déjà sa raison : on ne la réécrit pas.
      if (error instanceof DocumentStorageUnavailableError) {
        throw error;
      }
      const cause = error instanceof Error ? error.name : String(error);
      // Une pièce absente n'est pas un refus du canal : le canal a répondu, et sa
      // réponse est « rien ici ». `read` la traite quand même en panne — c'est son
      // contrat, cf. le port — mais la journaliser en ERREUR ferait crier le
      // chemin courant de `readIfPresent`, qui passe par ici.
      if (isMissingObject(error)) {
        this.logger.debug(`Stockage des pièces — « ${key} » n'existe pas (${cause}).`);
      } else {
        this.logger.error(`Stockage des pièces — ${what} de « ${key} » refusé : ${cause}`);
      }
      throw new DocumentStorageUnavailableError(
        `Le stockage des pièces a refusé le ${what}.`,
        error,
      );
    }
  }

  /** Le service S3, construit à la demande, ou un refus explicite si non configuré. */
  private service(): S3StorageService {
    if (this.cached !== null) {
      return this.cached;
    }
    const config = this.config.r2Storage(this.usage);
    if (config === null) {
      const prefix = `R2_${this.usage.toUpperCase()}`;
      throw new DocumentStorageUnavailableError(
        `Le stockage des pièces n'est pas configuré (${prefix}_BUCKET / ${prefix}_ACCESS_KEY_ID / ${prefix}_SECRET_ACCESS_KEY).`,
      );
    }
    this.cached = new S3StorageService(config);
    return this.cached;
  }
}

/**
 * L'objet n'existe pas — par opposition à un canal en panne.
 *
 * S3 nomme ce cas `NoSuchKey`, et certains implémenteurs (MinIO compris, selon
 * le verbe) rendent `NotFound` avec un 404. On lit **le nom ET le statut** :
 * s'appuyer sur le seul nom rendrait la distinction dépendante du fournisseur,
 * et c'est exactement le genre d'écart qui ne se voit qu'en production.
 */
function isMissingObject(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "NoSuchKey" || error.name === "NotFound") {
    return true;
  }
  return httpStatusOf(error) === 404;
}

/**
 * Le statut HTTP porté par une erreur du SDK AWS, s'il y en a un.
 *
 * Écrit avec des gardes `in` plutôt qu'un `as` : le SDK ne publie pas de type
 * pour cette forme, et un cast affirmerait une structure que rien ne vérifie —
 * il rendrait `undefined` au premier changement de forme, sans que rien ne
 * rougisse.
 */
function httpStatusOf(error: Error): number | undefined {
  if (!("$metadata" in error)) {
    return undefined;
  }
  const metadata: unknown = error.$metadata;
  if (typeof metadata !== "object" || metadata === null || !("httpStatusCode" in metadata)) {
    return undefined;
  }
  const status: unknown = metadata.httpStatusCode;
  return typeof status === "number" ? status : undefined;
}
