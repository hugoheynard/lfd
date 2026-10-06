import { Injectable } from "@nestjs/common";

import {
  DELIVERY_ROUND_DEPARTED,
  DeliveryRoundDepartedFact,
} from "../../../delivery/channels/handover/index.js";
import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { HandedOverOrdersReader } from "../../domain/ports/handed-over-orders.reader.js";
import { OrderDepartureRepository } from "../../domain/ports/order-departure.repository.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ROUND_DEPARTED = "handover.record-round-departed";

/**
 * **La garde passe au livreur** (`a-la-porte.md`, § 10 ter, BQ) : le
 * retrait retient, par commande, qu'elle est partie — le fournil cesse de la
 * contrôler (LB-Q1).
 *
 * Abonné DURABLE depuis le 2026-10-06 (`plan-depart-durable.md`, DD1) :
 * jusque-là, la livraison appelait un port du retrait en mémoire après la
 * validation, et un redémarrage entre les deux perdait la garde.
 *
 * - **Une commande déjà remise est ignorée** (B3) : aucun ordre n'est
 *   supposé entre ce fait et `handover.handed_over`, et une commande remise
 *   n'est plus sous la garde de personne.
 * - **Rejoué ou livré en retard**, il ne recule rien : la ligne est monotone
 *   par instant (`OrderDepartureRepository`, B1).
 */
@Injectable()
@DurableHandler({ type: DELIVERY_ROUND_DEPARTED, subscriber: RECORD_ROUND_DEPARTED })
export class RecordRoundDeparted implements DurableSubscriber {
  constructor(
    private readonly handedOver: HandedOverOrdersReader,
    private readonly departures: OrderDepartureRepository,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = DeliveryRoundDepartedFact.fromPayload(delivery.payload);
    const done = await this.handedOver.handedOverAmong(fact.orderIds);
    const departed = fact.orderIds.filter((orderId) => !done.has(orderId));
    await this.departures.recordDeparted(departed, fact.departedAt);
  }
}
