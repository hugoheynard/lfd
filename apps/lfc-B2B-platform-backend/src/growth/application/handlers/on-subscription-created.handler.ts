import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { SubscriptionCreatedEvent } from "../../../subscriptions/domain/events/subscription-created.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";

/**
 * Abonné du journal : `subscription.created` → une ligne d'activité sur la
 * personne (signal « lead qualifié », récurrence = engagement). Clé d'idempotence
 * déterministe par abonnement.
 */
@EventsHandler(SubscriptionCreatedEvent)
export class OnSubscriptionCreated implements IEventHandler<SubscriptionCreatedEvent> {
  constructor(private readonly recorder: ActivityRecorder) {}

  async handle(event: SubscriptionCreatedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.subscriptionCreated,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.subscriptionCreated}:${event.subscriptionId}`,
      payload: { subscriptionId: event.subscriptionId, recurrence: event.recurrence },
    });
  }
}
