import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { CompanyDeclaredEvent } from "../../../account/domain/events/company-declared.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";

/**
 * Abonné du journal : `company.declared` → une ligne d'activité sur la société.
 * Le canal (`self`/`staff`) est porté dans le payload : c'est lui qui distinguera
 * plus tard **adoption+** (self, zéro interaction staff) d'une déclaration en
 * démarchage. Clé d'idempotence déterministe par société.
 *
 * Les noms du moment — la société, son détenteur — arrivent avec l'événement
 * (lot B du plan des phrases) : l'abonné les fige sans relire les comptes.
 */
@EventsHandler(CompanyDeclaredEvent)
export class OnCompanyDeclared implements IEventHandler<CompanyDeclaredEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: CompanyDeclaredEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-company-declared");
  }

  private async run(event: CompanyDeclaredEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.companyDeclared,
      subjectType: "company",
      subjectId: event.companyId,
      idempotencyKey: `${ACTIVITY_TYPES.companyDeclared}:${event.companyId}`,
      payload: {
        subjectLabel: event.companyName,
        via: event.via,
        owner: event.owner === null ? null : { ...event.owner },
      },
    });
  }
}
