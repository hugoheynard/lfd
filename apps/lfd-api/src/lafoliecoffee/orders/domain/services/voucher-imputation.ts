/**
 * **Ce qu'un bon de fidélité impute** sur un panier (plan des points, C1) : la
 * remise du point de retrait s'applique d'abord, le bon ensuite, plafonné au
 * HT de marchandises restant, et borné à zéro. Il ne paie jamais le port ni la
 * surtaxe.
 *
 * Une fonction, deux lecteurs : `Order.draft` et le devis de la boutique. Deux
 * copies de la règle finiraient par annoncer un total que la caisse contredit.
 */
export function voucherImputationCents(
  valueCents: number,
  goodsAfterDiscountCents: number,
): number {
  return Math.max(0, Math.min(valueCents, goodsAfterDiscountCents));
}
