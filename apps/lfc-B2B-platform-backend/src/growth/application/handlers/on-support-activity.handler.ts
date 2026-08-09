import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { SupportHandledEvent } from "../../../account/domain/events/support-handled.event.js";
import { SupportRequestedEvent } from "../../../account/domain/events/support-requested.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";

/**
 * Abonnés du journal pour les **demandes de contact** : leur dépôt et leur
 * clôture. Les deux ensemble donnent le **délai de traitement** — la seule
 * mesure qui dise si la file est vraiment tenue, et qu'on ne pourrait pas
 * reconstituer après coup.
 */
@EventsHandler(SupportRequestedEvent)
export class OnSupportRequested implements IEventHandler<SupportRequestedEvent> {
  constructor(private readonly recorder: ActivityRecorder) {}

  async handle(event: SupportRequestedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.supportRequested,
      subjectType: "company",
      subjectId: event.companyId,
      occurredAt: event.requestedAt,
      idempotencyKey: `${ACTIVITY_TYPES.supportRequested}:${event.supportRequestId}`,
      payload: { supportRequestId: event.supportRequestId, channel: event.channel },
    });
  }
}

@EventsHandler(SupportHandledEvent)
export class OnSupportHandled implements IEventHandler<SupportHandledEvent> {
  constructor(private readonly recorder: ActivityRecorder) {}

  async handle(event: SupportHandledEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.supportHandled,
      subjectType: "company",
      subjectId: event.companyId,
      occurredAt: event.handledAt,
      idempotencyKey: `${ACTIVITY_TYPES.supportHandled}:${event.supportRequestId}`,
      payload: { supportRequestId: event.supportRequestId },
    });
  }
}
