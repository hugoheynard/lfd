/** Au plus tant de demandes par passage : le cron repasse toutes les cinq minutes. */
export const CARD_REFUND_SWEEP_LIMIT = 20;

/** Ce que le balayage a pris. */
export interface CardRefundSweepReport {
  readonly taken: number;
}

/**
 * **Le balayage des remboursements dus** (plan M2, §3.5, §6.8) — le cron
 * `sweep-card-refunds` (`admin/card-payments/sweep`), toutes les cinq minutes.
 */
export class SweepCardRefundsCommand {}
