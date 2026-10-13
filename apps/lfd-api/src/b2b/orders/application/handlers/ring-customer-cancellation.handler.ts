import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { ORDER_CANCELLED, OrderCancelledEvent } from "../../domain/events/order-cancelled.event.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RING_CUSTOMER_CANCELLATION = "orders.ring-customer-cancellation";

/** Le genre de la cloche, sans destinataire nommé : visible de tout le back-office. */
export const CUSTOMER_CANCELLATION_BELL = "order.cancelled_by_customer";

/**
 * **« Commande annulée par le client »** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.9,
 * Q-C6.8) — sans elle, l'équipe découvrirait l'annulation à la clôture.
 *
 * Abonné durable de `order.cancelled`, comme le journal et le courriel : la
 * cloche part si — et seulement si — l'annulation est écrite. Silencieux pour
 * une annulation de l'équipe : elle la connaît. Une clé par commande : un
 * rejeu de la boîte d'envoi ne sonne pas deux fois.
 */
@Injectable()
@DurableHandler({ type: ORDER_CANCELLED, subscriber: RING_CUSTOMER_CANCELLATION })
export class RingCustomerCancellation implements DurableSubscriber {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderCancelledEvent.fromPayload(delivery.payload);
    if (event.cancelledByKind === "staff") {
      return;
    }
    const who =
      event.cancelledByKind === "guest" ? "le client, depuis le lien de son courriel" : "le client";
    await this.notifier.notify([
      {
        kind: CUSTOMER_CANCELLATION_BELL,
        subject: `Commande annulée par le client — ${event.orderNumber}`,
        body:
          `La commande ${event.orderNumber} a été annulée par ${who}. ` +
          "Elle n'entrera pas au compte à produire, et l'argent suit les règles d'une annulation : rien à faire.",
        link: `/commandes/${event.orderId}`,
        idempotencyKey: `notification:${CUSTOMER_CANCELLATION_BELL}:${event.orderId}`,
        occurredAt: this.clock.now(),
      },
    ]);
  }
}
