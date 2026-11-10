/**
 * Un mois de passation et un état du marqueur, tels que la base les somme.
 * `madeToOrder: null` = lignes d'avant le suivi (plan sur mesure, M1).
 */
export interface MadeToOrderMonthTally {
  /** `AAAA-MM`, mois de passation à Paris. */
  readonly month: string;
  readonly madeToOrder: boolean | null;
  /** HT des lignes, avant remise de commande. */
  readonly htCents: number;
  /** Commandes distinctes qui portent au moins une ligne dans cet état. */
  readonly orders: number;
}

/**
 * Port de **lecture** du rapport mensuel du sur mesure (lot R). Les
 * commandes retenues sont celles du chiffre d'affaires (`revenue-scope.ts`).
 * `from` et `to` sont des jours de passation à Paris, compris.
 */
export abstract class MadeToOrderMonthlyReader {
  abstract tallies(from: string, to: string): Promise<readonly MadeToOrderMonthTally[]>;
}
