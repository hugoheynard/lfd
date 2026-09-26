/**
 * **Quelles commandes ont déjà rapporté des points** — lecture seule (ISP) :
 * le crédit et le rattrapage ne demandent au livre que ça.
 */
export abstract class LoyaltyEarnedOrdersReader {
  /** Parmi ces commandes, celles qui ont déjà leur ligne `earned`. */
  abstract earnedAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>>;
}
