import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_REVIEW_WITHDRAWN,
  OrderReviewWithdrawnFact,
} from "../../../orders/domain/events/order-review-withdrawn.fact.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { ActorNamer } from "../../domain/ports/actor-namer.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel, staffCitation } from "./order-fact-names.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDER_REVIEW_WITHDRAWN = "b2b.growth.record-order-review-withdrawn";

/**
 * Abonné du journal : `order.review_withdrawn` → **le témoin d'un visa
 * retiré**, par un geste ou remplacé par un nouveau visa (plan du visa des
 * commandes). Le sujet est le client ; la charge dit qui l'a retiré, et quand.
 * Clé `…:<reviewId>` : un visa ne se retire qu'une fois.
 */
@Injectable()
@DurableHandler({ type: ORDER_REVIEW_WITHDRAWN, subscriber: RECORD_ORDER_REVIEW_WITHDRAWN })
export class OnOrderReviewWithdrawn implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
    private readonly actors: ActorNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderReviewWithdrawnFact.fromPayload(delivery.payload);
    const subject = await customerLabel(this.customers, fact.placedByUserId);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderReviewWithdrawn,
      subjectType: "user",
      subjectId: fact.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderReviewWithdrawn}:${fact.reviewId}`,
      payload: {
        ...subject,
        orderId: fact.orderId,
        orderNumber: fact.orderNumber,
        withdrawnBy: await staffCitation(this.actors, fact.withdrawnByStaffId),
        withdrawnAt: fact.withdrawnAt.toISOString(),
      },
    });
  }
}
