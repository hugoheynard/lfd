import { Injectable } from "@nestjs/common";

import {
  ORDER_CANCELLED,
  OrderCancelledEvent,
} from "../../../orders/domain/events/order-cancelled.event.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { SubAccountNoticeDispatcher } from "../services/sub-account-notice.dispatcher.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_ORDER_CANCELLED = "b2b.sub-account-notices.on-order-cancelled";

/**
 * **La commande d'un site est annulée → son principal est prévenu**
 * (`plan-notifications-sous-comptes.md`, N2, clé `order_cancelled`).
 *
 * Le principal prévenu est celui COPIÉ sur la commande à la passation, jamais
 * le principal d'aujourd'hui (§2) : un site rattaché ailleurs depuis ne fait
 * rien fuiter vers son nouveau groupe.
 *
 * L'auteur est celui qui a annulé : le client (`cancelledByUserId`), ou
 * personne côté client quand c'est l'équipe.
 */
@Injectable()
@DurableHandler({ type: ORDER_CANCELLED, subscriber: NOTIFY_PRINCIPAL_ON_ORDER_CANCELLED })
export class NotifyPrincipalOnOrderCancelled implements DurableSubscriber {
  constructor(private readonly notices: SubAccountNoticeDispatcher) {}

  handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderCancelledEvent.fromPayload(delivery.payload);
    return this.notices.notify({
      eventId: delivery.eventId,
      kind: "order_cancelled",
      activity: "cancelled",
      orderId: event.orderId,
      authorOf: () => event.cancelledByUserId,
    });
  }
}
