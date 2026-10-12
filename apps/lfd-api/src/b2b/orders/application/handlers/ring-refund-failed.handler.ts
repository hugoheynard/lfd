import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_REFUND_FAILED,
  OrderRefundFailedFact,
} from "../../domain/events/order-refund-failed.fact.js";
import { OrderRefundRequestReader } from "../../domain/ports/order-refund-request.reader.js";
import { RefundAttentionBell } from "../services/refund-attention-bell.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RING_REFUND_FAILED = "orders.ring-refund-failed";

/**
 * **« Remboursement échoué chez Stripe — à traiter »** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C4.7) : le `re_…`
 * qu'une demande a émis a échoué (carte fermée…). Sonne seulement quand il est
 * celui de la demande ; « Relancer » ouvrira la génération suivante. Pas de
 * relance automatique (Q3) : une carte fermée refusera encore.
 */
@Injectable()
@DurableHandler({ type: ORDER_REFUND_FAILED, subscriber: RING_REFUND_FAILED })
export class RingRefundFailed implements DurableSubscriber {
  constructor(
    private readonly reader: OrderRefundRequestReader,
    private readonly bell: RefundAttentionBell,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderRefundFailedFact.fromPayload(ORDER_REFUND_FAILED, delivery.payload);
    const snapshot = await this.reader.snapshotOf(fact.orderId);
    if (snapshot === null || snapshot.request.stripeRefundId !== fact.stripeRefundId) {
      return;
    }
    await this.bell.ring({
      orderId: fact.orderId,
      orderNumber: snapshot.orderNumber,
      generation: snapshot.request.generation,
      announcedCents: snapshot.request.announcedCents,
      cause: "failed",
    });
  }
}
