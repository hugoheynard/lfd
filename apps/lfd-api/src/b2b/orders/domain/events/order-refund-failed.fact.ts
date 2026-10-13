import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";

/** Un remboursement en attente a échoué ou été annulé chez Stripe. Nom STABLE. */
export const ORDER_REFUND_FAILED = "order.refund_failed";
/** Un remboursement RÉUSSI a échoué ensuite — l'argent n'est plus rendu. Nom STABLE. */
export const ORDER_REFUND_REVERSED = "order.refund_reversed";

export type OrderRefundFailureType = typeof ORDER_REFUND_FAILED | typeof ORDER_REFUND_REVERSED;

/**
 * **Un remboursement constaté qui n'a pas rendu l'argent** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C4.7, C4.11 bis) —
 * fait DURABLE, écrit par `RecordOrderRefundHandler` dans la transaction du
 * constat. 🔴 Les deux types sont des valeurs écrites : irréversibles.
 *
 * Clé `<type>:<id de la ligne order_refund>` : un statut terminal ne revient
 * pas, le fait n'est donc écrit qu'une fois par remboursement.
 *
 * `stripeRefundId` voyage pour que l'abonné reconnaisse le `re_…` d'une
 * demande ; c'est la boîte d'envoi, pas le journal — qui n'en porte aucun.
 */
export class OrderRefundFailedFact implements DurableEvent {
  constructor(
    readonly type: OrderRefundFailureType,
    readonly orderId: string,
    /** L'id de la ligne `order_refund`. */
    readonly refundId: string,
    readonly stripeRefundId: string,
  ) {}

  durableFact(): DurableFact {
    return {
      type: this.type,
      key: `${this.type}:${this.refundId}`,
      payload: {
        orderId: this.orderId,
        refundId: this.refundId,
        stripeRefundId: this.stripeRefundId,
      },
    };
  }

  /** @throws {OrderSettlementPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(
    type: OrderRefundFailureType,
    payload: Readonly<Record<string, unknown>>,
  ): OrderRefundFailedFact {
    const { orderId, refundId, stripeRefundId } = payload;
    if (
      typeof orderId !== "string" ||
      orderId.length === 0 ||
      typeof refundId !== "string" ||
      refundId.length === 0 ||
      typeof stripeRefundId !== "string" ||
      stripeRefundId.length === 0
    ) {
      throw new OrderSettlementPayloadError(type);
    }
    return new OrderRefundFailedFact(type, orderId, refundId, stripeRefundId);
  }
}
