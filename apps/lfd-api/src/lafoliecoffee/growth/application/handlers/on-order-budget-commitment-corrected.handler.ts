import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_BUDGET_COMMITMENT_CORRECTED,
  OrderBudgetCommitmentCorrectedEvent,
} from "../../../orders/domain/events/order-budget-commitment-corrected.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { ActorNamer } from "../../domain/ports/actor-namer.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel, staffCitation } from "./order-fact-names.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDER_BUDGET_COMMITMENT_CORRECTED =
  "b2b.growth.record-order-budget-commitment-corrected";

/**
 * Abonné du journal : `order.budget_commitment_corrected` → **le témoin d'une
 * correction d'engagement budgétaire** (E3′). Le sujet est le client ; la
 * charge dit qui a corrigé (la fiche staff, sous son nom du moment), l'avant
 * et l'après. Visible dans l'historique du détail staff, qui lit le journal
 * par `orderId`. Durable : la clé garde un témoin par correction.
 */
@Injectable()
@DurableHandler({
  type: ORDER_BUDGET_COMMITMENT_CORRECTED,
  subscriber: RECORD_ORDER_BUDGET_COMMITMENT_CORRECTED,
})
export class OnOrderBudgetCommitmentCorrected implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
    private readonly actors: ActorNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderBudgetCommitmentCorrectedEvent.fromPayload(delivery.payload);
    const subject = await customerLabel(this.customers, event.placedByUserId);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderBudgetCommitmentCorrected,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderBudgetCommitmentCorrected}:${event.orderId}:${event.correctionId}`,
      payload: {
        ...subject,
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        correctedBy: await staffCitation(this.actors, event.correctedByStaffId),
        before: event.before,
        after: event.after,
      },
    });
  }
}
