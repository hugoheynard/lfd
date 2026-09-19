import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { OrderReadyEvent } from "../../../orders/domain/events/order-ready.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { ActorNamer } from "../../domain/ports/actor-namer.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel, staffCitation } from "./order-fact-names.js";

/**
 * Abonné du journal : `order.ready` → le témoin immuable du **colisage**.
 *
 * Écrit en même temps que celui de la remise, et pour la même raison : les deux
 * transitions ne vivaient que sur des colonnes qu'on peut `UPDATE`. En traiter
 * une sans l'autre aurait laissé la moitié de l'asymétrie qu'on venait de
 * corriger — le journal aurait su dire « ce client a reçu » sans pouvoir dire
 * « c'était prêt à telle heure », qui est précisément la question qu'on pose
 * quand une commande arrive en retard.
 *
 * `record` et non `recordOrFail` : au fournil comme au comptoir, une table
 * analytique indisponible ne doit pas empêcher de déclarer un bac fermé.
 *
 * `readyBy` cite la fiche avec son nom du moment, et la ligne porte le nom du
 * client en `subjectLabel` (D5 et D6 du plan des phrases, 2026-09-19).
 */
@EventsHandler(OrderReadyEvent)
export class OnOrderReady implements IEventHandler<OrderReadyEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
    private readonly actors: ActorNamer,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderReadyEvent): void {
    void this.work.track(this.run(event), "on-order-ready");
  }

  private async run(event: OrderReadyEvent): Promise<void> {
    const subject = await customerLabel(this.customers, event.placedByUserId);
    const by = await staffCitation(this.actors, event.readyBy);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderReady,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderReady}:${event.orderId}`,
      payload: {
        ...subject,
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        readyBy: by,
        readyAt: event.readyAt.toISOString(),
      },
    });
  }
}
