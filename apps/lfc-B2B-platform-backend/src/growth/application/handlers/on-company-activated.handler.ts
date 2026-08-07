import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { CompanyActivatedEvent } from "../../../account/domain/events/company-activated.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";

/**
 * Abonné du journal : `company.activated` → une ligne d'activité sur la société.
 * C'est le **jalon de conversion**. `occurredAt` = l'instant d'activation métier
 * (pas l'heure d'ingestion). Clé d'idempotence déterministe par société.
 */
@EventsHandler(CompanyActivatedEvent)
export class OnCompanyActivated implements IEventHandler<CompanyActivatedEvent> {
  constructor(private readonly recorder: ActivityRecorder) {}

  async handle(event: CompanyActivatedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.companyActivated,
      subjectType: "company",
      subjectId: event.companyId,
      occurredAt: event.activatedAt,
      idempotencyKey: `${ACTIVITY_TYPES.companyActivated}:${event.companyId}`,
      payload: { activatedAt: event.activatedAt.toISOString() },
    });
  }
}
