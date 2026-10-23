import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { COMMERCE_ORDER_REVISED, CommerceOrderRevisedFact } from "../../channels/commerce/index.js";
import { DayStopsLocator } from "../day-stops-locator.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const LOCATE_ON_ORDER_REVISED = "delivery.locate-on-order-revised";

/**
 * **Situer l'adresse d'une commande modifiée** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M1, §9) — la même
 * demande que `LocateOnOrderPlaced`, par le MÊME service, quand l'acheminement
 * a changé : une livraison qui change d'adresse ou de jour doit avoir son point
 * dans le prévisionnel. Il ne fait que DEMANDER, en fond.
 */
@Injectable()
@DurableHandler({ type: COMMERCE_ORDER_REVISED, subscriber: LOCATE_ON_ORDER_REVISED })
export class LocateOnOrderRevised implements DurableSubscriber {
  constructor(private readonly locating: DayStopsLocator) {}

  /** Un fait illisible rend une promesse rejetée, comme l'attend le relais — jamais un `throw` nu. */
  handle(delivery: DurableDelivery): Promise<void> {
    return Promise.resolve(delivery.payload).then((payload) => {
      const fact = CommerceOrderRevisedFact.fromPayload(payload);
      if (fact.routeChanged) {
        this.locating.locateOrderSoon(fact.orderId);
      }
    });
  }
}
