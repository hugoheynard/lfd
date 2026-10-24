import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_REVISED,
  OrderRevisedEvent,
} from "../../../orders/domain/events/order-revised.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { ActorNamer } from "../../domain/ports/actor-namer.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel, staffCitation } from "./order-fact-names.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDER_REVISED = "b2b.growth.record-order-revised";

/**
 * Abonné du journal : `order.revised` → **le témoin immuable d'une
 * modification** (plan `documentation/commandes/modification/plan-modifier-une-commande.md`,
 * M1, §5). Le sujet est le client ; la charge dit qui a modifié (la fiche
 * staff, ou le client, sous son nom du moment), quelle révision, ce qui a
 * changé et l'écart de total. Visible dans l'historique du détail staff, qui
 * lit le journal par `orderId`.
 *
 * Durable, comme `OnOrderCancelled` : la clé d'idempotence garde un seul
 * témoin par révision, rejeu compris.
 */
@Injectable()
@DurableHandler({ type: ORDER_REVISED, subscriber: RECORD_ORDER_REVISED })
export class OnOrderRevised implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
    private readonly actors: ActorNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderRevisedEvent.fromPayload(delivery.payload);
    const subject = await customerLabel(this.customers, event.placedByUserId);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderRevised,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderRevised}:${event.orderId}:${String(event.revision)}`,
      payload: {
        ...subject,
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        revision: event.revision,
        ...(await this.authorOf(event)),
        changes: [...event.changes],
        totalBeforeCents: event.totalBeforeCents,
        totalAfterCents: event.totalAfterCents,
      },
    });
  }

  /** L'équipe : `revisedBy` ; le client : `revisedBy: null` et `revisedByCustomer`. */
  private async authorOf(event: OrderRevisedEvent): Promise<Record<string, unknown>> {
    if (event.author.kind === "staff") {
      return { revisedBy: await staffCitation(this.actors, event.author.staffId) };
    }
    const named = await customerLabel(this.customers, event.author.userId);
    return {
      revisedBy: null,
      revisedByCustomer:
        named.subjectLabel === undefined
          ? event.author.userId
          : { id: event.author.userId, name: named.subjectLabel },
    };
  }
}
