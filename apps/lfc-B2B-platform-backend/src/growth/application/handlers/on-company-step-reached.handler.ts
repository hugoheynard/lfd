import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { CompanyStepReachedEvent } from "../../../account/domain/events/company-step-reached.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";

/**
 * Abonné du journal : `company.step_reached` → une ligne d'activité sur la
 * société, une **par étape**. La clé d'idempotence inclut l'étape → refranchir la
 * même pièce ne rejournalise pas (on garde la PREMIÈRE fois où elle a été atteinte,
 * ce qui alimente la complétion et le délai des frictions).
 */
@EventsHandler(CompanyStepReachedEvent)
export class OnCompanyStepReached implements IEventHandler<CompanyStepReachedEvent> {
  constructor(private readonly recorder: ActivityRecorder) {}

  async handle(event: CompanyStepReachedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.companyStepReached,
      subjectType: "company",
      subjectId: event.companyId,
      idempotencyKey: `${ACTIVITY_TYPES.companyStepReached}:${event.step}:${event.companyId}`,
      payload: { step: event.step },
    });
  }
}
