import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { SupportHandledEvent } from "../../../account/domain/events/support-handled.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { labelOf, SUPPORT_ACTIVITY_WORK, subjectOf } from "./on-support-activity-support.js";

/**
 * Journalise la **clôture** d'une demande de contact — le second des deux
 * instants dont l'écart fait le délai de traitement (voir
 * `on-support-activity-support.ts`).
 */
@EventsHandler(SupportHandledEvent)
export class OnSupportHandled implements IEventHandler<SupportHandledEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: SupportHandledEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), SUPPORT_ACTIVITY_WORK);
  }

  private async run(event: SupportHandledEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.supportHandled,
      ...subjectOf(event.companyId, event.requestedByUserId),
      occurredAt: event.handledAt,
      idempotencyKey: `${ACTIVITY_TYPES.supportHandled}:${event.supportRequestId}`,
      payload: { ...labelOf(event.subjectLabel), supportRequestId: event.supportRequestId },
    });
  }
}
