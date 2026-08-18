import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { SubscriptionCreatedEvent } from "../../../subscriptions/domain/events/subscription-created.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { BackgroundWork } from "../../../infra/events/background-work.js";

/**
 * Abonné du journal : `subscription.created` → une ligne d'activité sur la
 * personne (signal « lead qualifié », récurrence = engagement). Clé d'idempotence
 * déterministe par abonnement.
 */
@EventsHandler(SubscriptionCreatedEvent)
export class OnSubscriptionCreated implements IEventHandler<SubscriptionCreatedEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: SubscriptionCreatedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-subscription-created");
  }

  private async run(event: SubscriptionCreatedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.subscriptionCreated,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.subscriptionCreated}:${event.subscriptionId}`,
      payload: { subscriptionId: event.subscriptionId, recurrence: event.recurrence },
    });
  }
}
