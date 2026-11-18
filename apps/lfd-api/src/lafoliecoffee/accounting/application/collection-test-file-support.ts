import { CollectionTestFileTamperedError } from "../domain/errors/collection-test-errors.js";
import type { StoredCollectionTestFile } from "../domain/ports/collection-test-file.reader.js";
import { sha256Of } from "../domain/services/collection-batch-file.js";

/** Le fichier d'un envoi d'essai, prêt à télécharger. */
export interface CollectionTestFileDownload {
  readonly xml: string;
  readonly fileName: string;
}

/**
 * Rend le fichier **gardé** d'un envoi, après avoir vérifié son empreinte —
 * comme le fichier d'un lot. Le nom commence par `ESSAI-` : un fichier rangé
 * sur un bureau perd son contexte, jamais son nom.
 *
 * @throws {CollectionTestFileTamperedError}
 */
export function verifiedTestFile(file: StoredCollectionTestFile): CollectionTestFileDownload {
  if (sha256Of(file.xml) !== file.sha256) {
    throw new CollectionTestFileTamperedError(file.messageId);
  }
  return { xml: file.xml, fileName: `ESSAI-prelevement-${file.messageId}.xml` };
}
