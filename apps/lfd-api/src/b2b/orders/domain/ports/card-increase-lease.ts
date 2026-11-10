/**
 * **Le bail de l'exécuteur des hausses** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.6) — la
 * figure de `CardRefundRequestLease` (plan M2, §3.5) : une exclusion
 * mutuelle, pas une règle métier, et un seul consommateur (ISP).
 *
 * 🔴 Hors de toute unité de travail : le bail est VALIDÉ avant la
 * recomposition, sans quoi un second exécuteur ne le verrait pas.
 */
export abstract class CardIncreaseLease {
  /**
   * Prend le bail d'un projet `ready` dont l'échéance est venue, si personne
   * ne le tient (libre, ou échu à `wallNow`). `false` : un autre le tient, il
   * n'est plus `ready`, ou son prochain essai n'est pas encore dû.
   */
  abstract claim(proposalId: string, until: Date, wallNow: Date): Promise<boolean>;
}
