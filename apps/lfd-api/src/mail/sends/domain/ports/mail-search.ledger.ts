/** Une recherche rangée, telle que la lecture des résultats la relit. */
export interface StoredMailSearch {
  readonly id: string;
  readonly staffId: string;
  readonly at: Date;
  readonly sendIds: readonly string[];
}

/** Port de lecture des recherches rangées (décision 8). */
export abstract class MailSearchLedger {
  /** `null` : la recherche n'existe pas (ou plus). */
  abstract searchOf(searchId: string): Promise<StoredMailSearch | null>;
}
