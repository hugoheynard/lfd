import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_OFFER_REVALUED,
  OrderOfferRevaluedEvent,
} from "../../../orders/domain/events/order-offered.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel } from "./order-fact-names.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDER_OFFER_REVALUED = "lfc.growth.record-order-offer-revalued";

/**
 * Abonné du journal : `order.offer_revalued` → **la valeur d'une commande
 * offerte, revue par une modification** (`la-commande-offerte.md`, § 2.6).
 * Une clé par révision : le dernier témoin d'une commande dit sa valeur.
 */
@Injectable()
@DurableHandler({ type: ORDER_OFFER_REVALUED, subscriber: RECORD_ORDER_OFFER_REVALUED })
export class OnOrderOfferRevalued implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderOfferRevaluedEvent.fromPayload(delivery.payload);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderOfferRevalued,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderOfferRevalued}:${event.orderId}:${String(event.revision)}`,
      payload: {
        ...(await customerLabel(this.customers, event.placedByUserId)),
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        revision: event.revision,
        offeredTotalCents: event.offeredTotalCents,
        offeredVatCents: event.offeredVatCents,
      },
    });
  }
}
