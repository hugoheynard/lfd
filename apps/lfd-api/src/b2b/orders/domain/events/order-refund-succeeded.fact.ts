import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_REFUND_SUCCEEDED = "order.refund_succeeded";

/**
 * **Un remboursement Stripe a réussi sur une commande** — fait DURABLE, écrit
 * dans la transaction qui le constate (`RecordOrderRefundHandler`, lot E5b
 * du plan `facture-carte-et-remboursements.md`). La
 * comptabilité l'écoute pour émettre l'avoir.
 *
 * Écrit quand le constat fait passer le remboursement à `succeeded` — une
 * fois : `succeeded` ne revient jamais (`refundTransition`). Clé
 * `order.refund_succeeded:<id du remboursement>`.
 */
export class OrderRefundSucceededFact implements DurableEvent {
  constructor(
    readonly orderId: string,
    /** L'id de la ligne `order_refund` — jamais le `re_…` de Stripe. */
    readonly refundId: string,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_REFUND_SUCCEEDED,
      key: `${ORDER_REFUND_SUCCEEDED}:${this.refundId}`,
      payload: { orderId: this.orderId, refundId: this.refundId },
    };
  }

  /** @throws {OrderSettlementPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderRefundSucceededFact {
    const { orderId, refundId } = payload;
    if (
      typeof orderId !== "string" ||
      orderId.length === 0 ||
      typeof refundId !== "string" ||
      refundId.length === 0
    ) {
      throw new OrderSettlementPayloadError(ORDER_REFUND_SUCCEEDED);
    }
    return new OrderRefundSucceededFact(orderId, refundId);
  }
}
