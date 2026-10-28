/** Un raccourci vivant, tel qu'un écran le lit. */
export interface StoredBatchShortcut {
  readonly id: string;
  readonly sku: string;
  readonly label: string;
  readonly pieces: number;
  readonly position: number;
}

/**
 * Port de **lecture** des raccourcis du fournil — des lignes, sans agrégat :
 * la page des réglages et la fiche d'atelier n'écrivent rien.
 */
export abstract class BatchShortcutReader {
  /** Les raccourcis vivants, par SKU puis par position. */
  abstract live(): Promise<readonly StoredBatchShortcut[]>;
}
