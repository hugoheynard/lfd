import { Injectable, Logger } from "@nestjs/common";
import { S3StorageService } from "@lfd/storage";

import { DocumentStorageUnavailableError } from "../../shared/errors/storage-errors.js";
import { AppConfig } from "../config/app-config.js";
import { DocumentStore, type StoredDocument } from "./document-store.js";

/**
 * Adaptateur **R2/S3** du stockage de pièces (`@lfd/storage`).
 *
 * Le service S3 n'est construit qu'à la première pièce, et seulement si le
 * bucket est configuré ; sinon `service()` refuse **clairement** plutôt que
 * d'échouer sur une erreur AWS obscure. Le reste de l'app démarre sans stockage
 * — seules les pièces sont indisponibles (cf. `AppConfig.storageConfig`).
 */
@Injectable()
export class S3DocumentStore extends DocumentStore {
  private readonly logger = new Logger(S3DocumentStore.name);
  private cached: S3StorageService | null = null;

  constructor(private readonly config: AppConfig) {
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
      this.logger.error(`Stockage des pièces — ${what} de « ${key} » refusé : ${cause}`);
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
    const config = this.config.r2Storage("kbis");
    if (config === null) {
      throw new DocumentStorageUnavailableError(
        "Le stockage des pièces n'est pas configuré (R2_KBIS_BUCKET / R2_KBIS_ACCESS_KEY_ID / R2_KBIS_SECRET_ACCESS_KEY).",
      );
    }
    this.cached = new S3StorageService(config);
    return this.cached;
  }
}
