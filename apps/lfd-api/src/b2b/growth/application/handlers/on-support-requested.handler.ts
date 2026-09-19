import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { SupportRequestedEvent } from "../../../account/domain/events/support-requested.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { labelOf, SUPPORT_ACTIVITY_WORK, subjectOf } from "./on-support-activity-support.js";

/**
 * Journalise le **dépôt** d'une demande de contact — le premier des deux
 * instants dont l'écart fait le délai de traitement (voir
 * `on-support-activity-support.ts`).
 */
@EventsHandler(SupportRequestedEvent)
export class OnSupportRequested implements IEventHandler<SupportRequestedEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: SupportRequestedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), SUPPORT_ACTIVITY_WORK);
  }

  private async run(event: SupportRequestedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.supportRequested,
      ...subjectOf(event.companyId, event.requestedByUserId),
      occurredAt: event.requestedAt,
      idempotencyKey: `${ACTIVITY_TYPES.supportRequested}:${event.supportRequestId}`,
      payload: {
        ...labelOf(event.subjectLabel),
        supportRequestId: event.supportRequestId,
        channel: event.channel,
      },
    });
  }
}
