/**
 * **Ce qu'il reste à rendre d'une commande payée, et ce qui est en vol** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.4 ; plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.3, §6.2) — ce que la règle de l'annulation lit.
 *
 * Depuis le lot P1.c, tiré de la position du bloc `card-payment` (une seule
 * arithmétique) : le carnet d'`orders` n'existe plus.
 *
 * - `refundableCents` = encaissé − remboursé (toute nature) — seul un
 *   remboursement réussi a rendu l'argent ;
 * - `inFlightCents` = l'argent en attente de la banque, **sauf** celui d'une
 *   demande `amount` (§6.2, `refund_in_flight`) : un remboursement en vol
 *   refuse l'annulation, son échec ultérieur laisserait un reste que
 *   personne ne rend.
 */
export interface RefundPosition {
  readonly refundableCents: number;
  readonly inFlightCents: number;
}

/** La position, depuis l'encaissé, le remboursé et ce qui est en vol — pure. */
export function refundPositionOf(
  chargedCents: number,
  refundedCents: number,
  inFlightCents: number,
): RefundPosition {
  return { refundableCents: Math.max(0, chargedCents - refundedCents), inFlightCents };
}
