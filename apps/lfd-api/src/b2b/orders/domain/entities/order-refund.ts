/**
 * Les statuts d'un remboursement chez Stripe (`Refund.status`), recopiés tels
 * quels. Seul `succeeded` compte dans le cumul remboursé.
 */
export const REFUND_STATUSES = [
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** La seule devise admise : nos commandes sont toutes en euros. */
export const REFUND_CURRENCY = "eur";

/**
 * Un remboursement **tel que Stripe l'annonce**, déjà réduit par la passerelle.
 * `refundedAt` est l'instant Stripe (`created`), jamais le nôtre.
 */
export interface RefundReport {
  readonly stripeRefundId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: RefundStatus;
  readonly refundedAt: Date;
}

/** Un remboursement constaté, tel que la table `order_refund` le range. */
export interface OrderRefundState {
  readonly id: string;
  readonly stripeRefundId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: RefundStatus;
  readonly refundedAt: Date;
  readonly recordedAt: Date;
  readonly updatedAt: Date;
  /** L'avoir qui l'a constaté (lot E5b) ; `null` tant qu'il n'y en a pas. */
  readonly creditNoteId: string | null;
}

/** Ce qu'un nouveau statut fait d'un statut connu. */
export type RefundTransition = "apply" | "stale" | "illegal";

const OPEN: ReadonlySet<RefundStatus> = new Set(["pending", "requires_action"]);

/**
 * **Un statut ne régresse pas.** Les webhooks de Stripe n'arrivent pas dans
 * l'ordre : un `refund.created` (`pending`) peut suivre le `refund.updated`
 * qui l'a dit réussi. Il est alors périmé (`stale`) — ignoré, pas refusé.
 *
 * - depuis une attente (`pending`, `requires_action`), tout s'applique ;
 * - depuis `succeeded`, seul `failed` s'applique : Stripe le permet (un
 *   remboursement réussi peut échouer plus tard, la banque ayant refusé le
 *   crédit — `refund.failed`). `canceled` est **illégal** : Stripe n'annule
 *   qu'un remboursement en attente ;
 * - `failed` et `canceled` sont terminaux.
 */
export function refundTransition(from: RefundStatus, to: RefundStatus): RefundTransition {
  if (from === to) {
    return "stale";
  }
  if (OPEN.has(from)) {
    return "apply";
  }
  if (from === "succeeded") {
    if (to === "failed") {
      return "apply";
    }
    return to === "canceled" ? "illegal" : "stale";
  }
  return "stale";
}
