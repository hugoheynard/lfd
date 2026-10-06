import { Injectable } from "@nestjs/common";

import {
  DELIVERY_ORDERS_BROUGHT_BACK,
  DeliveryOrdersBroughtBackFact,
} from "../../../delivery/channels/handover/index.js";
import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { OrderDepartureRepository } from "../../domain/ports/order-departure.repository.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDERS_BROUGHT_BACK = "handover.record-orders-brought-back";

/**
 * **La garde rentre au dépôt** (`a-la-porte.md`, B3, LB-Q2) : une commande
 * « rapportée » est revenue, le fournil peut de nouveau la contrôler.
 *
 * Abonné DURABLE depuis le 2026-10-06 (`plan-depart-durable.md`, DD1, B2) :
 * il écrit la même ligne que le départ, et c'est l'instant porté par chacun
 * des deux faits qui les ordonne (`OrderDepartureRepository`, B1) — un retour
 * plus ancien que le dernier départ ne ramène pas une commande repartie.
 */
@Injectable()
@DurableHandler({ type: DELIVERY_ORDERS_BROUGHT_BACK, subscriber: RECORD_ORDERS_BROUGHT_BACK })
export class RecordOrdersBroughtBack implements DurableSubscriber {
  constructor(private readonly departures: OrderDepartureRepository) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = DeliveryOrdersBroughtBackFact.fromPayload(delivery.payload);
    await this.departures.recordReturned(fact.orderIds, fact.broughtBackAt);
  }
}
