import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { UserRegisteredEvent } from "../../../account/domain/events/user-registered.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";

/**
 * Abonné du journal : `user.registered` → une ligne d'activité sur la personne
 * (signal « lead mid » : inscrit, pas encore de commande). Clé d'idempotence
 * déterministe par personne.
 */
@EventsHandler(UserRegisteredEvent)
export class OnUserRegistered implements IEventHandler<UserRegisteredEvent> {
  constructor(private readonly recorder: ActivityRecorder) {}

  async handle(event: UserRegisteredEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.userRegistered,
      subjectType: "user",
      subjectId: event.userId,
      idempotencyKey: `${ACTIVITY_TYPES.userRegistered}:${event.userId}`,
      payload: { email: event.email },
    });
  }
}
