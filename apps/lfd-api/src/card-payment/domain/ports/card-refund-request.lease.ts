/**
 * **Le bail de l'exécuteur** des remboursements (plan M2, §3.5) — à part de
 * l'écriture de la demande : une exclusion mutuelle, pas une règle métier, et
 * un seul consommateur (ISP).
 *
 * 🔴 Hors de toute unité de travail : le bail doit être VALIDÉ avant l'appel au
 * prestataire, sans quoi un second exécuteur ne le verrait pas.
 */
export abstract class CardRefundRequestLease {
  /**
   * Prend le bail d'une demande `to_issue` si personne ne le tient (libre, ou
   * échu à `wallNow`). `false` : un autre le tient, ou elle n'est plus à émettre.
   */
  abstract claim(requestId: string, token: string, until: Date, wallNow: Date): Promise<boolean>;
}
