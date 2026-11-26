/** Au plus tant de libellés par passage : le cron repasse toutes les cinq minutes. */
export const INTENT_RELABEL_SWEEP_LIMIT = 50;

/** Ce que le balayage a fait des libellés dus. */
export interface IntentRelabelSweepReport {
  readonly taken: number;
  readonly posted: number;
  readonly abandoned: number;
}

/**
 * **Le balayage des libellés dus** (plan
 * `documentation/payment/plan-pointage-stripe.md`, lot 2) — le cron
 * `admin/card-payments/labels/sweep`, toutes les cinq minutes : ce que
 * l'envoi d'après validation n'a pas posé.
 */
export class SweepIntentRelabelsCommand {}
