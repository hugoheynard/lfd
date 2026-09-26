import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { OrderAbandonedEvent } from "../../../orders/domain/events/order-abandoned.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel } from "./order-fact-names.js";

/**
 * Abonné du journal : `order.abandoned` → le témoin immuable d'un **abandon de
 * règlement**.
 *
 * Même raison que le colisage et le retrait : l'annulation ne vit sinon que
 * sur une colonne qu'on peut réécrire, et c'est précisément ce qu'on cherchera
 * le jour où un client dira n'avoir jamais annulé.
 *
 * `record` et non `recordOrFail` : une table analytique indisponible n'a pas à
 * rendre l'abandon impossible — Stripe a déjà annulé l'intention.
 */
@EventsHandler(OrderAbandonedEvent)
export class OnOrderAbandoned implements IEventHandler<OrderAbandonedEvent> {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderAbandonedEvent): void {
    void this.work.track(this.run(event), "on-order-abandoned");
  }

  private async run(event: OrderAbandonedEvent): Promise<void> {
    const subject = await customerLabel(this.customers, event.placedByUserId);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderAbandoned,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderAbandoned}:${event.orderId}`,
      payload: {
        ...subject,
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        outcome: event.outcome,
      },
    });
  }
}
