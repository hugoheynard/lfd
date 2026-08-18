import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { UserRegisteredEvent } from "../../../account/domain/events/user-registered.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { BackgroundWork } from "../../../infra/events/background-work.js";

/**
 * Abonné du journal : `user.registered` → une ligne d'activité sur la personne
 * (signal « lead mid » : inscrit, pas encore de commande). Clé d'idempotence
 * déterministe par personne.
 */
@EventsHandler(UserRegisteredEvent)
export class OnUserRegistered implements IEventHandler<UserRegisteredEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: UserRegisteredEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-user-registered");
  }

  private async run(event: UserRegisteredEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.userRegistered,
      subjectType: "user",
      subjectId: event.userId,
      idempotencyKey: `${ACTIVITY_TYPES.userRegistered}:${event.userId}`,
      payload: { email: event.email },
    });
  }
}
