import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { UserRegisteredEvent } from "../../../account/domain/events/user-registered.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";

/**
 * Abonné du journal : `user.registered` → une ligne d'activité sur la personne
 * (signal « lead mid » : inscrit, pas encore de commande). Clé d'idempotence
 * déterministe par personne.
 *
 * 🔴 **Sans e-mail** depuis le lot B du plan des phrases (2026-09-19) : une
 * coordonnée n'entre pas au journal, et la file des prospects lit l'adresse
 * sur la fiche (`CustomerEmailReader`). **Sans libellé** non plus : le
 * catalogue admet le nom de la personne si l'inscription le porte, et
 * `UserRegisteredEvent` n'en porte pas — la fiche naît de la seule identité du
 * jeton (vérifié le 2026-09-19, `customer-principal.resolver.ts`).
 *
 * ⚠️ Pas de lecture du nom ici, et c'est voulu : attendre une lecture avant
 * d'écrire laisserait le garde poser l'acteur de la requête entre-temps, et la
 * ligne passerait de `system` à `customer` selon qui finit le premier (constaté
 * par `orders.e2e-spec.ts`, 2026-09-19). Pour un nom qu'on n'aurait pas.
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
      payload: {},
    });
  }
}
