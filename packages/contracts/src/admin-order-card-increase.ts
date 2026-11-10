/**
 * **Les états d'un projet de hausse VIVANT** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.2, §2.8) —
 * ceux que la fiche staff montre : les autres sont terminés, et l'historique
 * les dira (S3).
 */
export type AdminCardIncreaseState = "awaiting_payment" | "ready" | "stalled";

/**
 * **Le projet de hausse vivant d'une commande payée par carte**, sur la fiche
 * staff (§2.8) : le complément demandé, où il en est, son échéance de
 * paiement, et le refus noté s'il y en a un.
 */
export interface AdminOrderCardIncrease {
  /** Le complément à payer, en centimes. */
  readonly complementCents: number;
  readonly state: AdminCardIncreaseState;
  /** L'échéance du paiement, ISO — lue seulement en `awaiting_payment`. */
  readonly expiresAt: string;
  readonly refusal: string | null;
}
