import { Injectable } from "@nestjs/common";

import { ORDER_PAID, OrderPaidFact } from "../../../orders/domain/events/order-paid.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { SubAccountNoticeDispatcher } from "../services/sub-account-notice.dispatcher.js";
import { placementAuthor } from "./notify-principal-on-order-placed.handler.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_ORDER_PAID = "b2b.sub-account-notices.on-order-paid";

/**
 * **La commande carte d'un site est payée → son principal apprend qu'elle
 * est passée** (`plan-notifications-sous-comptes.md`, N2, clé `order_placed`).
 *
 * Décision de Hugo (2026-10-20) : comme l'accusé au client, l'avis d'une
 * commande carte attend le paiement confirmé — annoncer une commande dont la
 * carte serait refusée trente secondes plus tard serait faux. Une commande
 * au compte est annoncée à la passation, et jamais ici : la même règle
 * (`settlementDecidedAtPlacement`) sépare les deux abonnés, aucun ne double
 * l'autre. Le journal d'envoi s'adosse à l'id de CE fait, stable comme
 * celui de la passation.
 */
@Injectable()
@DurableHandler({ type: ORDER_PAID, subscriber: NOTIFY_PRINCIPAL_ON_ORDER_PAID })
export class NotifyPrincipalOnOrderPaid implements DurableSubscriber {
  constructor(private readonly notices: SubAccountNoticeDispatcher) {}

  handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderPaidFact.fromPayload(delivery.payload);
    return this.notices.notify({
      eventId: delivery.eventId,
      kind: "order_placed",
      activity: "placed",
      orderId: fact.orderId,
      authorOf: placementAuthor,
      concerns: (summary) => !summary.settledAtPlacement,
    });
  }
}
