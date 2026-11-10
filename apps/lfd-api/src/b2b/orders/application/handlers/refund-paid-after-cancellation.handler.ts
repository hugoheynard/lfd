import { Injectable } from "@nestjs/common";

import { CardRefunds } from "../../../../card-payment/channels/requests/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_PAID_AFTER_CANCELLATION,
  OrderPaidAfterCancellationEvent,
} from "../../domain/events/order-paid-after-cancellation.event.js";
import { OrderLock } from "../../domain/ports/order-lock.js";
import { orderCardSubject } from "../services/order-card-subject.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const REFUND_PAID_AFTER_CANCELLATION = "orders.refund-paid-after-cancellation";

/** Le code de la demande — 🔴 une valeur écrite (`card_payment.refund_request.reason`). */
export const PAID_AFTER_CANCELLATION_REASON = "paid_after_cancellation";

/**
 * **L'encaissé après annulation se rembourse tout seul** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.11 — défaut de
 * Q5 ; plan `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.3, §3.6, lot P1.c). La commande est annulée et ne sera pas produite,
 * l'argent n'est pas à nous.
 *
 * Dans l'unité de travail du reçu : le verrou `orders` d'abord (§3.3 : « l'abonné
 * prend le verrou `orders` avant d'appeler `CardRefunds` »), puis une
 * `remainder` `return` par paiement encaissé qui a encore un reste —
 * `CardRefunds.requestRemainder` sur le sujet, qui relit sous ses verrous.
 * Un fait relivré ne fait rien : le port rend la demande en cours, ou rien
 * quand tout est rendu. Le port ne lève pas sur un sujet (aucun refus
 * déterministe à absorber) ; une panne se rejoue. L'exécuteur de
 * `card-payment` part après validation ; aucune cloche quand tout va bien.
 */
@Injectable()
@DurableHandler({
  type: ORDER_PAID_AFTER_CANCELLATION,
  subscriber: REFUND_PAID_AFTER_CANCELLATION,
})
export class RefundPaidAfterCancellation implements DurableSubscriber {
  constructor(
    private readonly lock: OrderLock,
    private readonly refunds: CardRefunds,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderPaidAfterCancellationEvent.fromPayload(delivery.payload);
    await this.lock.lock(event.orderId);
    await this.refunds.requestRemainder(
      { subject: orderCardSubject(event.orderId) },
      {
        nature: "return",
        reason: PAID_AFTER_CANCELLATION_REASON,
        schedule: "now",
        requestedBy: null,
      },
    );
  }
}
