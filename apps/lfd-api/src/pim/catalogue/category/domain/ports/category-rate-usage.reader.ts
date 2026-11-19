/** Un compte de taux réglés, pour un taux dans un contexte de vente. */
export interface RateContextTally {
  readonly vatRateId: string;
  readonly contextId: string;
  readonly count: number;
}

/**
 * **Combien de familles visent chaque taux, contexte par contexte** — ce que
 * la famille publie pour que la liste des taux dise ce qui les retient.
 * Un couple sans famille est absent.
 */
export abstract class CategoryRateUsageReader {
  abstract tallies(): Promise<readonly RateContextTally[]>;
}
