import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { OrderPlacedEvent } from "../../../orders/domain/events/order-placed.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";

/**
 * Abonné du journal : `order.placed` → une ligne d'activité (sujet = la personne
 * qui a commandé ; signal « lead chaud »). L'`idempotencyKey` est **déterministe
 * par commande** → un événement rejoué n'ajoute rien (le recorder est idempotent).
 * `growth/` ne connaît d'`orders` que la **classe d'événement** (le contrat),
 * jamais ses tables ni ses agrégats.
 */
@EventsHandler(OrderPlacedEvent)
export class OnOrderPlaced implements IEventHandler<OrderPlacedEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderPlacedEvent): void {
    // **Suivi** : cet abonné tourne hors de la requête HTTP. Sans cette
    // inscription, personne — ni la prod, ni un test — ne sait quand il a fini.
    void this.work.track(this.run(event), "on-order-placed");
  }

  private async run(event: OrderPlacedEvent): Promise<void> {
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderPlaced,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderPlaced}:${event.orderId}`,
      payload: {
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        companyId: event.companyId,
        totalCents: event.totalCents,
      },
    });
  }
}
