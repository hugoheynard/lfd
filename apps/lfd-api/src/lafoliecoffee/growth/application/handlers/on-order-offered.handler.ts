import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_OFFERED,
  OrderOfferedEvent,
} from "../../../orders/domain/events/order-offered.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { ActorNamer } from "../../domain/ports/actor-namer.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel, staffCitation } from "./order-fact-names.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDER_OFFERED = "lfc.growth.record-order-offered";

/**
 * Abonné du journal : `order.offered` → **le témoin d'une commande offerte**
 * (`plan-commande-offerte.md`, O-8). Le sujet est le client ; la charge dit
 * qui a offert (la fiche staff, sous son nom du moment), la nature et la
 * valeur. Durable : une commande n'est offerte qu'une fois.
 */
@Injectable()
@DurableHandler({ type: ORDER_OFFERED, subscriber: RECORD_ORDER_OFFERED })
export class OnOrderOffered implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
    private readonly actors: ActorNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderOfferedEvent.fromPayload(delivery.payload);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderOffered,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderOffered}:${event.orderId}`,
      payload: {
        ...(await customerLabel(this.customers, event.placedByUserId)),
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        offeredBy: await staffCitation(this.actors, event.offeredByStaffId),
        nature: event.nature,
        offeredTotalCents: event.offeredTotalCents,
        offeredVatCents: event.offeredVatCents,
      },
    });
  }
}
