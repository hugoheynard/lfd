import type { ExportReaderKey } from "../entities/export-reader-key.js";

/** Port d'écriture des clés d'export : l'agrégat entier, chargé puis rangé. */
export abstract class ExportReaderKeyRepository {
  abstract load(id: string): Promise<ExportReaderKey | null>;
  abstract save(key: ExportReaderKey): Promise<void>;
}
