/** La seule nature déduite du CA : la vente n'a pas lieu. */
export const DEDUCTED_REFUND_NATURE = "return";

/** Ce qu'il faut d'un remboursement réussi pour savoir s'il se déduit. */
export interface RefundFacts {
  readonly amountCents: number;
  /** `null` pour un remboursement fait hors de la plateforme, sans nature. */
  readonly nature: string | null;
}

/**
 * **Ce qui se déduit du CA d'une commande**, TTC en centimes (plan de
 * l'export, § 5 et § 10) :
 *
 * - un remboursement `adjustment` ne se déduit **jamais** : le total de la
 *   commande a déjà baissé, le déduire le compterait deux fois ;
 * - un `return` ne se déduit que d'une commande qui compte encore dans le
 *   CA : une commande annulée ou remboursée en entier en est déjà sortie ;
 * - un remboursement sans nature (fait hors de la plateforme) ne se déduit
 *   pas : rien ne dit que la vente n'a pas eu lieu.
 *
 * Il n'existe pas de HT remboursé : un remboursement n'a ni ligne ni TVA.
 */
export function returnRefundedCents(
  countsAsRevenue: boolean,
  refunds: readonly RefundFacts[],
): number {
  if (!countsAsRevenue) {
    return 0;
  }
  return refunds
    .filter((refund) => refund.nature === DEDUCTED_REFUND_NATURE)
    .reduce((sum, refund) => sum + refund.amountCents, 0);
}
