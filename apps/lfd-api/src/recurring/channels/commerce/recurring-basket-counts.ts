/**
 * **« Combien de paniers actifs ? »** — la lecture que les paniers récurrents
 * publient pour la fiche client, déclarée et implémentée par eux : le
 * commerce demande, il ne lit pas la table.
 */
export abstract class RecurringBasketCounts {
  /** Les paniers actifs ouverts par l'une de ces personnes. */
  abstract activeOf(buyerUserIds: readonly string[]): Promise<number>;
}
