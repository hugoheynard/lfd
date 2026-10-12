/**
 * **Le balayage des remboursements dus** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C4.7 (b)) — appelé
 * par le cron de rafraîchissement, au plus {@link REFUND_SWEEP_LIMIT}
 * demandes par passage.
 */
export class SweepOrderRefundsCommand {}

/** Le plafond d'un passage ; le reste attend le suivant, cinq minutes plus tard. */
export const REFUND_SWEEP_LIMIT = 20;

/** Ce que le passage a pris. */
export interface OrderRefundSweepReport {
  readonly taken: number;
}
