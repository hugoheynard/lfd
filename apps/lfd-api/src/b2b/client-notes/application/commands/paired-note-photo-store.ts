import { Logger } from "@nestjs/common";

import { DocumentStorageUnavailableError } from "../../../../platform/shared/errors/storage-errors.js";
import { DocumentStore, type StoredDocument } from "../../../../platform/storage/document-store.js";
import { ClientNoteThumbnailMissingError } from "../../domain/errors/client-notebook-errors.js";
import { clientNoteThumbnailKey } from "../../domain/value-objects/client-note-photo-key.js";

const logger = new Logger("PairedNotePhotoStore");

/**
 * **Le stockage vu par la séquence d'écriture des notes** : chaque photo y est
 * une PAIRE — la photo lisible sous sa clé, la vignette sous la clé dérivée.
 *
 * Pourquoi un décorateur du port plutôt qu'une option du socle : la vignette est
 * propre aux notes (plan `documentation/b2b/plan-notes-photo-du-commercial.md`,
 * D7 bis), et la séquence du socle (`photo-card-editing.ts`) ne range et ne
 * supprime qu'UNE clé par carte. Ce magasin fait de cette clé une paire, sans
 * que le socle ni la procédure de livraison n'en sachent rien.
 *
 * - `save` range la photo puis sa vignette — la vignette validée AVEC elle,
 *   fournie à la construction. Si la vignette échoue, la photo est retirée : la
 *   séquence ne connaît pas encore sa clé, personne d'autre ne la retirerait.
 * - `delete` retire les deux, et tente toujours la seconde même si la première
 *   échoue ; l'échec remonte à la séquence, qui le journalise sans faire
 *   échouer la requête.
 */
export class PairedNotePhotoStore extends DocumentStore {
  constructor(
    private readonly inner: DocumentStore,
    private readonly thumbnail: StoredDocument | null,
  ) {
    super();
  }

  /** @throws {ClientNoteThumbnailMissingError} aucune vignette n'accompagne ce dépôt. */
  async save(key: string, photo: StoredDocument): Promise<string> {
    if (this.thumbnail === null) {
      throw new ClientNoteThumbnailMissingError();
    }
    const saved = await this.inner.save(key, photo);
    try {
      await this.inner.save(clientNoteThumbnailKey(saved), this.thumbnail);
    } catch (error) {
      await this.discardLonePhoto(saved);
      throw error;
    }
    return saved;
  }

  read(key: string): Promise<Buffer> {
    return this.inner.read(key);
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return this.inner.readIfPresent(key);
  }

  async delete(photoKey: string): Promise<void> {
    let failure: Error | null = null;
    for (const key of [photoKey, clientNoteThumbnailKey(photoKey)]) {
      try {
        await this.inner.delete(key);
      } catch (error) {
        failure ??=
          error instanceof Error ? error : new DocumentStorageUnavailableError(String(error));
      }
    }
    if (failure !== null) {
      throw failure;
    }
  }

  /** Retire une photo rangée sans sa vignette ; un échec se journalise, l'erreur d'origine prime. */
  private async discardLonePhoto(key: string): Promise<void> {
    try {
      await this.inner.delete(key);
    } catch (error) {
      logger.error(
        `Photo de note restée au stockage (vignette en échec) : ${key}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
