import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  PRODUCTION_PACKING_LIST_DRAWN,
  PackingListDrawnEvent,
} from "../../../production/channels/packing/index.js";
import { PackingShadowLedger } from "../../domain/ports/packing-shadow.ledger.js";
import { linesBySku } from "../../domain/services/lines-by-sku.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PACKING_LIST_DRAWN = "packing.shadow.draw-list";

/**
 * **Une commande entre dans la liste à coliser de l'ombre** (plan
 * `colisage/colisage.md`, K1, §11 B1–B2).
 *
 * Inscrite si elle n'y est pas, jamais réécrite : la réannonce et le rejeu
 * republient le même instantané, et une commande déjà là ne bouge pas. Une
 * remise arrivée avant elle attend déjà dans la réserve — rien à rattraper ici.
 *
 * En K1, personne ne lit cette table pour décider : c'est l'ombre.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_PACKING_LIST_DRAWN, subscriber: ON_PACKING_LIST_DRAWN })
export class OnPackingListDrawn implements DurableSubscriber {
  constructor(private readonly shadow: PackingShadowLedger) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = PackingListDrawnEvent.fromPayload(delivery.payload);
    await this.shadow.drawOrder({
      serviceDay: event.serviceDay,
      orderId: event.order.orderId,
      reference: event.order.reference,
      customerLabel: event.order.customerLabel,
      fulfillmentMethod: event.order.fulfillmentMethod,
      dueAt: event.order.dueAt,
      drawnAt: event.drawnAt,
      // K2b : la colonne Contenants s'ouvre pour toute commande inscrite
      // désormais ; les commandes déjà inscrites restent `counted`.
      containerMode: "listed",
      lines: linesBySku(event.order.lines),
    });
  }
}
