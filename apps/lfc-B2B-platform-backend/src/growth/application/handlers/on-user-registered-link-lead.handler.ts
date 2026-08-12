import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { UserRegisteredEvent } from "../../../account/domain/events/user-registered.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { LeadRepository } from "../../domain/ports/lead.repository.js";
import { BackgroundWork } from "../../../infra/events/background-work.js";

/**
 * **Rapprochement automatique** : quand une personne s'inscrit, si un **lead cold
 * ouvert** porte le même e-mail, on le rattache à son compte et on le **convertit**
 * (le démarchage a porté ses fruits — motion *emailing*, par opposition à la
 * conversion manuelle après RDV côté staff). Best-effort : un rapprochement manqué
 * ne casse jamais l'inscription (abonné détaché, non attendu).
 *
 * C'est un **second** abonné de `user.registered` (le premier journalise le fait) :
 * deux handlers indépendants sur le même événement, chacun sa responsabilité.
 */
@EventsHandler(UserRegisteredEvent)
export class OnUserRegisteredLinkLead implements IEventHandler<UserRegisteredEvent> {
  constructor(
    private readonly leads: LeadRepository,
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: UserRegisteredEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-user-registered-link-lead");
  }

  private async run(event: UserRegisteredEvent): Promise<void> {
    if (event.email === "") {
      return;
    }
    const lead = await this.leads.findOpenByEmail(event.email);
    if (lead === null) {
      return;
    }
    lead.linkToUser(event.userId);
    await this.leads.save(lead);

    const leadId = lead.id;
    if (leadId === null) {
      return;
    }
    await this.recorder.record({
      type: ACTIVITY_TYPES.leadConverted,
      subjectType: "lead",
      subjectId: leadId,
      idempotencyKey: `${ACTIVITY_TYPES.leadConverted}:${leadId}`,
      payload: { via: "registration", linkedUserId: event.userId },
    });
  }
}
