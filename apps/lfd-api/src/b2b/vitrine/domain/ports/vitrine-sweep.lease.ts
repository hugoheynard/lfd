/**
 * Port du **bail du balayage** de la vitrine — à part des écritures des
 * abonnés et des livraisons : une exclusion mutuelle, pas une règle métier,
 * et un seul consommateur (ISP), comme `OrderRefundRequestLease`.
 *
 * 🔴 Hors de toute unité de travail : le bail doit être VALIDÉ avant le
 * premier envoi, sans quoi un second balayage ne le verrait pas.
 */
export abstract class VitrineSweepLease {
  /**
   * Prend le bail si personne ne le tient (libre, ou échu à `wallNow`).
   * Rend `false` quand un autre balayage le tient.
   */
  abstract claim(token: string, until: Date, wallNow: Date): Promise<boolean>;
  /** Rend le bail — seulement s'il est encore tenu par `token`. */
  abstract release(token: string): Promise<void>;
}
