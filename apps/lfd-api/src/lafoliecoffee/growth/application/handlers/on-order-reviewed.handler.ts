import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_REVIEWED,
  OrderReviewedFact,
} from "../../../orders/domain/events/order-reviewed.fact.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { ActorNamer } from "../../domain/ports/actor-namer.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel, staffCitation } from "./order-fact-names.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDER_REVIEWED = "b2b.growth.record-order-reviewed";

/**
 * Abonné du journal : `order.reviewed` → **le témoin d'un visa** posé sur une
 * commande (plan du visa des commandes). Le sujet est le client ; la charge
 * dit qui a visé (la fiche, sous son nom du moment), quand, et à quelle
 * révision — jamais la note. Visible dans l'historique du détail staff, qui
 * lit le journal par `orderId`. Clé `…:<reviewId>` : un témoin par visa.
 */
@Injectable()
@DurableHandler({ type: ORDER_REVIEWED, subscriber: RECORD_ORDER_REVIEWED })
export class OnOrderReviewed implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
    private readonly actors: ActorNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderReviewedFact.fromPayload(delivery.payload);
    const subject = await customerLabel(this.customers, fact.placedByUserId);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderReviewed,
      subjectType: "user",
      subjectId: fact.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderReviewed}:${fact.reviewId}`,
      payload: {
        ...subject,
        orderId: fact.orderId,
        orderNumber: fact.orderNumber,
        reviewedBy: await staffCitation(this.actors, fact.reviewedByStaffId),
        reviewedAt: fact.reviewedAt.toISOString(),
        reviewedRevision: fact.reviewedRevision,
      },
    });
  }
}
