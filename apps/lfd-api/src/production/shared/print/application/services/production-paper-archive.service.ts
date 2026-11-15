import { Buffer } from "node:buffer";

import { Injectable } from "@nestjs/common";

import { DocumentStorageUnavailableError } from "../../../../../platform/shared/errors/storage-errors.js";
import { ProductionDocumentStore } from "../../../../../platform/storage/production-document-store.js";

/** Un papier servi : ses octets et le nom proposé au téléchargement. */
export interface ProductionPaper {
  readonly bytes: Buffer;
  readonly fileName: string;
}

/** Où un papier se range et sous quel nom il se télécharge. */
export interface PaperSlot {
  readonly key: string;
  readonly fileName: string;
}

/**
 * Un papier tout juste rendu. `archivable` est faux quand il est parti dégradé
 * (une lecture en panne) : on le sert, mais on ne le fige pas, et le tirage
 * suivant le refera complet.
 */
export interface PaperDraft {
  readonly bytes: Buffer;
  readonly archivable: boolean;
}

/**
 * **L'archive des papiers du fournil : les relire s'ils existent, ranger
 * l'exemplaire sinon.**
 *
 * ## Pourquoi on les archive
 *
 * Parce que **tout le papier doit exister**. Une feuille partie au fournil et un
 * compte à produire affiché au mur sont des faits ; les refaire plus tard
 * donnerait d'autres documents, et c'est précisément quand on cherche ce qui
 * s'est passé qu'on en a besoin.
 *
 * ## Écrits au premier tirage, comme le bon de commande
 *
 * La plupart des journées ne verront jamais leur PDF demandé, et le rendu est
 * **déterministe** — deux tirages simultanés écrivent les mêmes octets sous la
 * même clé, le second écrase le premier par un objet identique. Ni verrou, ni
 * réservation.
 *
 * Le rangement est **best-effort** : un R2 en panne ne doit pas empêcher le
 * fournil d'imprimer. On rend les octets qu'on vient de fabriquer, et le
 * rangement retentera au tirage suivant.
 *
 * Ce service ne sait rien de ce qu'il range : le rendu est à
 * `ProductionPaperRenderer`, et chaque cas d'usage relie les deux.
 */
@Injectable()
export class ProductionPaperArchive {
  constructor(private readonly documents: ProductionDocumentStore) {}

  /** L'exemplaire rangé sous `slot.key`, ou celui que `make` rend — rangé s'il est archivable. */
  async storedOr(slot: PaperSlot, make: () => Promise<PaperDraft>): Promise<ProductionPaper> {
    const archived = await this.readArchived(slot.key);
    if (archived !== null) {
      return { bytes: archived, fileName: slot.fileName };
    }
    const draft = await make();
    if (draft.archivable) {
      await this.archive(slot.key, draft.bytes);
    }
    return { bytes: draft.bytes, fileName: slot.fileName };
  }

  /** L'archive, ou `null` — y compris quand le stockage est en panne. */
  private async readArchived(key: string): Promise<Buffer | null> {
    try {
      return await this.documents.readIfPresent(key);
    } catch (error) {
      if (error instanceof DocumentStorageUnavailableError) {
        return null;
      }
      throw error;
    }
  }

  /** Le rangement ne fait pas échouer le tirage — cf. l'en-tête. */
  private async archive(key: string, bytes: Buffer): Promise<void> {
    try {
      await this.documents.save(key, { bytes, contentType: "application/pdf" });
    } catch {
      // Silence volontaire : l'adaptateur a journalisé, le fournil a son papier,
      // et le prochain tirage retentera.
    }
  }
}
