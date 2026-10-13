/**
 * Port du **bail de l'exécuteur** des remboursements (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.7, étape 1) — à
 * part de l'écriture de la demande : une exclusion mutuelle, pas une règle
 * métier, et un seul consommateur (ISP).
 *
 * 🔴 Hors de toute unité de travail : le bail doit être VALIDÉ avant l'appel
 * à Stripe, sans quoi un second exécuteur ne le verrait pas.
 */
export abstract class OrderRefundRequestLease {
  /**
   * Prend le bail si personne ne le tient (libre, ou échu à `wallNow`).
   * Rend `false` quand un autre exécuteur le tient, ou que la demande n'existe pas.
   */
  abstract claim(orderId: string, token: string, until: Date, wallNow: Date): Promise<boolean>;
}
