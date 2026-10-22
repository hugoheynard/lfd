import type { CollectionTestState } from "../entities/collection-test.js";

/** Un essai pour la liste — tout son état, sauf le fichier. */
export type CollectionTestSummary = Omit<CollectionTestState, "xml" | "fileSha256">;

/** Port de lecture de la liste « Essais ». */
export abstract class CollectionTestsReader {
  /** Du plus récent au plus ancien. */
  abstract list(): Promise<readonly CollectionTestSummary[]>;
}
