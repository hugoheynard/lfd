/**
 * **« Relancer le remboursement »** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.7 (c), C4.9) —
 * l'équipe rend la demande au balayage tout de suite et lance l'exécuteur
 * après validation. N'attend jamais Stripe.
 */
export class RetryOrderRefundCommand {
  constructor(readonly orderId: string) {}
}
