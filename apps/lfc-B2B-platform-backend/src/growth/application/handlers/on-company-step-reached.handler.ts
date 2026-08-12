import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { CompanyStepReachedEvent } from "../../../account/domain/events/company-step-reached.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { BackgroundWork } from "../../../infra/events/background-work.js";

/**
 * Abonné du journal : `company.step_reached` → une ligne d'activité sur la
 * société, une **par étape**. La clé d'idempotence inclut l'étape → refranchir la
 * même pièce ne rejournalise pas (on garde la PREMIÈRE fois où elle a été atteinte,
 * ce qui alimente la complétion et le délai des frictions).
 */
@EventsHandler(CompanyStepReachedEvent)
export class OnCompanyStepReached implements IEventHandler<CompanyStepReachedEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: CompanyStepReachedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-company-step-reached");
  }

  private async run(event: CompanyStepReachedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.companyStepReached,
      subjectType: "company",
      subjectId: event.companyId,
      idempotencyKey: `${ACTIVITY_TYPES.companyStepReached}:${event.step}:${event.companyId}`,
      payload: { step: event.step },
    });
  }
}
