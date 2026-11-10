import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { SubscriptionCreatedEvent } from "../../../subscriptions/domain/events/subscription-created.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";

/**
 * Abonné du journal : `subscription.created` → une ligne d'activité sur la
 * personne (signal « lead qualifié », récurrence = engagement). Clé d'idempotence
 * déterministe par abonnement.
 *
 * La personne y est nommée au moment du fait (`subjectLabel`, lot B du plan
 * des phrases) — sans libellé si sa fiche n'a pas de nom : le port ne se rabat
 * jamais sur l'adresse.
 */
@EventsHandler(SubscriptionCreatedEvent)
export class OnSubscriptionCreated implements IEventHandler<SubscriptionCreatedEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
    private readonly customers: CustomerNamer,
  ) {}

  handle(event: SubscriptionCreatedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-subscription-created");
  }

  private async run(event: SubscriptionCreatedEvent): Promise<void> {
    const name = await this.nameOrNull(event.placedByUserId);
    await this.recorder.record({
      type: ACTIVITY_TYPES.subscriptionCreated,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.subscriptionCreated}:${event.subscriptionId}`,
      payload: {
        ...(name === null ? {} : { subjectLabel: name }),
        subscriptionId: event.subscriptionId,
        recurrence: event.recurrence,
      },
    });
  }

  /** L'annuaire est best-effort : une fiche illisible ne perd pas le fait, seulement son libellé. */
  private async nameOrNull(userId: string): Promise<string | null> {
    try {
      return await this.customers.nameOf(userId);
    } catch {
      return null;
    }
  }
}
