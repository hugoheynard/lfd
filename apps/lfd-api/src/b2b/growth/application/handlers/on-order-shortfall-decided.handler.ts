import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_SHORTFALL_DECIDED,
  OrderShortfallDecidedEvent,
} from "../../../orders/domain/events/order-shortfall-decided.event.js";
import { shipmentKeySuffix } from "../../../../production/channels/commerce/index.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { ActorNamer } from "../../domain/ports/actor-namer.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel, staffCitation } from "./order-fact-names.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDER_SHORTFALL_DECIDED = "b2b.growth.record-order-shortfall-decided";

/**
 * Abonné du journal : `order.shortfall_decided` → **le témoin d'un départ
 * incomplet décidé** (plan
 * plan E6c2 (`documentation/commandes/bon-de-livraison.md`)
 * § 5). Le sujet est le client ; la charge dit qui a décidé (la fiche staff,
 * sous son nom du moment), ce qui part, et ce que devient le reste. Visible
 * dans l'historique du détail staff, qui lit le journal par `orderId`.
 *
 * Durable, comme `OnOrderRevised` : la clé d'idempotence garde un seul
 * témoin par commande, rejeu compris.
 */
@Injectable()
@DurableHandler({ type: ORDER_SHORTFALL_DECIDED, subscriber: RECORD_ORDER_SHORTFALL_DECIDED })
export class OnOrderShortfallDecided implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
    private readonly actors: ActorNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderShortfallDecidedEvent.fromPayload(delivery.payload);
    const subject = await customerLabel(this.customers, event.placedByUserId);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderShortfallDecided,
      subjectType: "user",
      subjectId: event.placedByUserId,
      // Une trace par envoi décidé (plan E7 reliquat, annexe A.2).
      idempotencyKey: `${ACTIVITY_TYPES.orderShortfallDecided}:${event.orderId}${shipmentKeySuffix(event.rank)}`,
      payload: {
        ...subject,
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        decidedBy: await staffCitation(this.actors, event.decidedByStaffId),
        departing: event.departing.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        remainder: event.remainder,
      },
    });
  }
}
