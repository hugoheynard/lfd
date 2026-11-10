import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { GuestAccountClaimedEvent } from "../../../account/domain/events/guest-account-claimed.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";

/**
 * Une fiche invité est devenue un compte (R1 du plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`) :
 * pour la croissance, c'est une **inscription**. Même ligne que
 * `OnUserRegistered` — `user.registered` sur la personne, sans charge —, et
 * même clé d'idempotence : une personne ne s'inscrit qu'une fois, par quelque
 * chemin qu'elle y arrive.
 *
 * Pas de rapprochement avec un lead (`OnUserRegisteredLinkLead`) : le fait ne
 * porte que l'identifiant, et ce rapprochement lit l'adresse de l'inscription.
 */
@EventsHandler(GuestAccountClaimedEvent)
export class OnGuestAccountClaimed implements IEventHandler<GuestAccountClaimedEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: GuestAccountClaimedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP.
    void this.work.track(this.run(event), "on-guest-account-claimed");
  }

  private async run(event: GuestAccountClaimedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.userRegistered,
      subjectType: "user",
      subjectId: event.userId,
      idempotencyKey: `${ACTIVITY_TYPES.userRegistered}:${event.userId}`,
      payload: {},
    });
  }
}
