/** Ce que l'expiration a fait des projets échus, par issue de l'annulation (§2.7). */
export interface CardIncreaseExpiryReport {
  /** Intention annulée : le projet est abandonné. */
  readonly abandoned: number;
  /** Intention déjà payée : le chemin payé est rejoué, le projet passe `ready`. */
  readonly settled: number;
  /** Paiement en cours, ou prestataire muet : réessai au passage suivant. */
  readonly retried: number;
}

/**
 * **L'abandon par le délai** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.7) — route
 * machine `admin/orders/card-increases/expire`, cron de cinq minutes.
 */
export class ExpireCardIncreasesCommand {}
