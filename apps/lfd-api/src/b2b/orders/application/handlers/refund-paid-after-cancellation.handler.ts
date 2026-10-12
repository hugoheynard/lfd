import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderRefundRequest } from "../../domain/entities/order-refund-request.js";
import {
  ORDER_PAID_AFTER_CANCELLATION,
  OrderPaidAfterCancellationEvent,
} from "../../domain/events/order-paid-after-cancellation.event.js";
import { OrderRefundRequestRepository } from "../../domain/ports/order-refund-request.repository.js";
import { OrderRefundRepository } from "../../domain/ports/order-refund.repository.js";
import { OrderRefundDispatch } from "../services/order-refund-dispatch.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const REFUND_PAID_AFTER_CANCELLATION = "orders.refund-paid-after-cancellation";

/**
 * **L'encaissé après annulation se rembourse tout seul** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C4.11 — défaut de
 * Q5). Remplace la cloche « à rembourser depuis Stripe » (`RingRefundDue`) :
 * la commande est annulée et ne sera pas produite, l'argent n'est pas à nous.
 *
 * Dans l'unité de travail du reçu : verrou `orders`, carnet relu, et une
 * demande `paid_after_cancellation` SI aucune n'existe et que le reste est
 * positif — un fait relivré ne fait rien. Le reste se calcule sur
 * l'encaissé et les remboursements, jamais sur le statut : le carnet laisse
 * ces commandes `failed` (C4.1, 8). L'exécuteur part après validation ;
 * aucune cloche quand tout va bien.
 */
@Injectable()
@DurableHandler({
  type: ORDER_PAID_AFTER_CANCELLATION,
  subscriber: REFUND_PAID_AFTER_CANCELLATION,
})
export class RefundPaidAfterCancellation implements DurableSubscriber {
  constructor(
    private readonly ledgers: OrderRefundRepository,
    private readonly requests: OrderRefundRequestRepository,
    private readonly dispatch: OrderRefundDispatch,
    private readonly clock: Clock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderPaidAfterCancellationEvent.fromPayload(delivery.payload);
    const ledger = await this.ledgers.loadByOrder(event.orderId);
    if (ledger === null || (await this.requests.load(event.orderId)) !== null) {
      return;
    }
    const remainder = ledger.position().refundableCents;
    if (remainder <= 0) {
      return;
    }
    const now = this.clock.now();
    await this.requests.save(
      OrderRefundRequest.request({
        orderId: event.orderId,
        cause: "paid_after_cancellation",
        announcedCents: remainder,
        requestedAt: now,
        requestedBy: null,
        firstAttemptAt: now,
      }),
    );
    this.dispatch.afterCommitFor(event.orderId);
  }
}
