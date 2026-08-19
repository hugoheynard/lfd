import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { SupportHandledEvent } from "../../../account/domain/events/support-handled.event.js";
import { SupportRequestedEvent } from "../../../account/domain/events/support-requested.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";

/**
 * Abonnés du journal pour les **demandes de contact** : leur dépôt et leur
 * clôture. Les deux ensemble donnent le **délai de traitement** — la seule
 * mesure qui dise si la file est vraiment tenue, et qu'on ne pourrait pas
 * reconstituer après coup.
 *
 * Le **sujet** suit la demande : la société quand il y en a une, la personne
 * sinon — même règle que pour un rendez-vous. Un prospect sans entreprise laisse
 * donc une trace sur lui, et non aucune trace du tout.
 */

/** Sur quoi porte l'entrée de journal : la société, ou à défaut la personne. */
function subjectOf(
  companyId: string | null,
  userId: string,
): { subjectType: "company" | "user"; subjectId: string } {
  return companyId === null
    ? { subjectType: "user", subjectId: userId }
    : { subjectType: "company", subjectId: companyId };
}
@EventsHandler(SupportRequestedEvent)
export class OnSupportRequested implements IEventHandler<SupportRequestedEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: SupportRequestedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-support-activity");
  }

  private async run(event: SupportRequestedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.supportRequested,
      ...subjectOf(event.companyId, event.requestedByUserId),
      occurredAt: event.requestedAt,
      idempotencyKey: `${ACTIVITY_TYPES.supportRequested}:${event.supportRequestId}`,
      payload: { supportRequestId: event.supportRequestId, channel: event.channel },
    });
  }
}

@EventsHandler(SupportHandledEvent)
export class OnSupportHandled implements IEventHandler<SupportHandledEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: SupportHandledEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-support-activity");
  }

  private async run(event: SupportHandledEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.supportHandled,
      ...subjectOf(event.companyId, event.requestedByUserId),
      occurredAt: event.handledAt,
      idempotencyKey: `${ACTIVITY_TYPES.supportHandled}:${event.supportRequestId}`,
      payload: { supportRequestId: event.supportRequestId },
    });
  }
}
