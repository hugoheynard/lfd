import type { CollectionTestState } from "../entities/collection-test.js";

/** Un essai pour la liste — son état, jamais le fichier. */
export type CollectionTestSummary = CollectionTestState;

/** Port de lecture de la liste « Essais ». */
export abstract class CollectionTestsReader {
  /** Du plus récent au plus ancien. */
  abstract list(): Promise<readonly CollectionTestSummary[]>;
}
