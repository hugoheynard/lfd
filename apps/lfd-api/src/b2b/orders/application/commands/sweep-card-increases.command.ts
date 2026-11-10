/** Au plus tant de projets par passage et par liste : le cron repasse dans cinq minutes. */
export const CARD_INCREASE_SWEEP_LIMIT = 20;

/**
 * Un complément peut avoir été payé sans que le webhook arrive : au-delà de
 * cinq minutes d'attente, le balayage le demande au prestataire (§2.7).
 */
export const PROVIDER_CHECK_AFTER_MS = 5 * 60 * 1000;

/** Ce que le balayage a repris. */
export interface CardIncreaseSweepReport {
  /** Projets `ready` rendus à l'exécuteur. */
  readonly applied: number;
  /** Projets `awaiting_payment` vérifiés chez le prestataire. */
  readonly checked: number;
}

/**
 * **Le balayage des hausses** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.6, §2.7) —
 * route machine `admin/orders/card-increases/sweep`, cron de cinq minutes.
 */
export class SweepCardIncreasesCommand {}
