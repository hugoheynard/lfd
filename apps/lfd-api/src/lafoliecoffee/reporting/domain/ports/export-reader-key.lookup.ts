import type { ExportReaderKey } from "../entities/export-reader-key.js";

/**
 * Port de la **garde** : retrouver une clé par le haché de son secret. Elle
 * ne lit que ça, et n'écrit rien — distinct du port d'écriture (ISP).
 */
export abstract class ExportReaderKeyLookup {
  abstract findBySecretHash(secretHash: string): Promise<ExportReaderKey | null>;
}
