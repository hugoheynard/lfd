/**
 * **La fidélité sur la période** : combien de commandes un même client
 * (une société pour un pro, une personne sinon) a passées.
 *
 * Comme les tranches horaires, les bornes sont lues par la requête
 * (`width_bucket(commandes, bornes)`), qui rend l'index du palier.
 */
export const LOYALTY_TIERS = [
  { key: "once", label: "1 commande", minOrders: 1 },
  { key: "regular", label: "2 à 4 commandes", minOrders: 2 },
  { key: "loyal", label: "5 commandes et plus", minOrders: 5 },
] as const;

/** Les bornes passées à `width_bucket` : le seuil de chaque palier sauf le premier. */
export function loyaltyBounds(): readonly number[] {
  return LOYALTY_TIERS.slice(1).map((tier) => tier.minOrders);
}

/** Le palier d'un nombre de commandes — la même règle que `width_bucket`. */
export function loyaltyTierIndexOf(orders: number): number {
  return loyaltyBounds().filter((bound) => orders >= bound).length;
}
