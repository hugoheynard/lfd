import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_NO_SHOW,
  OrderNoShowFact,
} from "../../../orders/domain/events/order-no-show.fact.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { ActorNamer } from "../../domain/ports/actor-namer.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel, staffCitation } from "./order-fact-names.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDER_NO_SHOW = "b2b.growth.record-order-no-show";

/**
 * Abonné du journal : `order.no_show` → **le témoin immuable d'une commande
 * que le client n'est pas venu retirer** (`plan-commande-particulier-reglee-en-boutique.md`,
 * § 5 bis). Le sujet est le client ; la charge dit qui l'a déclarée (la fiche,
 * sous son nom du moment), et quand. Visible dans l'historique du détail staff,
 * qui lit le journal par `orderId`.
 *
 * Durable, comme l'annulation : `record` reste best-effort, la clé
 * d'idempotence garde un seul témoin par commande, rejeu compris.
 */
@Injectable()
@DurableHandler({ type: ORDER_NO_SHOW, subscriber: RECORD_ORDER_NO_SHOW })
export class OnOrderNoShow implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
    private readonly actors: ActorNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderNoShowFact.fromPayload(delivery.payload);
    const subject = await customerLabel(this.customers, fact.placedByUserId);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderNoShow,
      subjectType: "user",
      subjectId: fact.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderNoShow}:${fact.orderId}`,
      payload: {
        ...subject,
        orderId: fact.orderId,
        orderNumber: fact.orderNumber,
        noShowBy: await staffCitation(this.actors, fact.noShowBy),
        noShowAt: fact.noShowAt.toISOString(),
      },
    });
  }
}
