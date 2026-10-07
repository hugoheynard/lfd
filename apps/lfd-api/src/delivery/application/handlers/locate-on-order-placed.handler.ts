import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { COMMERCE_ORDER_PLACED, CommerceOrderPlacedFact } from "../../channels/commerce/index.js";
import { DayStopsLocator } from "../day-stops-locator.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const LOCATE_ON_ORDER_PLACED = "delivery.locate-on-order-placed";

/**
 * **Situer l'adresse d'une commande passée** (`composition-automatique.md`,
 * Q4, lot CA0), sur le fait durable que le commerce écrit à la passation.
 *
 * Il ne fait que DEMANDER : le géocodage part après la validation de la garde
 * du relais, en fond, et ne remonte jamais (`DeliveryStopsLocating`). Une
 * commande qui n'est pas une livraison, annulée ou sans jour, ne fait rien.
 * Rejoué, il redemande un passage idempotent : seul ce qui manque au carnet
 * et au cache part au géocodeur.
 */
@Injectable()
@DurableHandler({ type: COMMERCE_ORDER_PLACED, subscriber: LOCATE_ON_ORDER_PLACED })
export class LocateOnOrderPlaced implements DurableSubscriber {
  constructor(private readonly locating: DayStopsLocator) {}

  /** Un fait illisible rend une promesse rejetée, comme l'attend le relais — jamais un `throw` nu. */
  handle(delivery: DurableDelivery): Promise<void> {
    return Promise.resolve(delivery.payload).then((payload) => {
      this.locating.locateOrderSoon(CommerceOrderPlacedFact.fromPayload(payload).orderId);
    });
  }
}
