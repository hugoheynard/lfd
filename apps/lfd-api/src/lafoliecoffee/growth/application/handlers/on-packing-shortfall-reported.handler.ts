import { Injectable } from "@nestjs/common";

import {
  PACKING_SHORTFALL_REPORTED,
  PackingShortfallReportedEvent,
} from "../../../../packing/channels/commerce/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { ActorNamer } from "../../domain/ports/actor-namer.js";
import { staffCitation } from "./order-fact-names.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDER_SHORTFALL_REPORTED = "b2b.growth.record-order-shortfall-reported";

/** Le sujet de la trace : la commande. */
const ORDER_SUBJECT = "order";

/**
 * Abonné du journal : `packing.shortfall_reported` → **le manque signalé, à
 * l'historique de la commande** (plan du reliquat, § 5 ter, B4b.3).
 *
 * Le commerce garde le signal le plus récent sur `order_shortfall` ;
 * l'historique, lui, garde CHAQUE signal : la clé porte l'instant du geste,
 * comme celle du fait. Le sujet est la commande ; la charge dit qui a signalé
 * (la fiche staff, sous son nom du moment), quand, quel envoi, et dû / au
 * bac par article. L'instant de la trace est celui du geste, pas celui de la
 * livraison du fait.
 *
 * Durable : un redémarrage ne perd pas la trace, et un rejeu n'en écrit pas
 * une seconde.
 */
@Injectable()
@DurableHandler({ type: PACKING_SHORTFALL_REPORTED, subscriber: RECORD_ORDER_SHORTFALL_REPORTED })
export class OnPackingShortfallReportedActivity implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly actors: ActorNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = PackingShortfallReportedEvent.fromPayload(delivery.payload);
    const reportedAt = event.reportedAt.toISOString();
    await this.recorder.recordOrFail({
      type: ACTIVITY_TYPES.orderShortfallReported,
      subjectType: ORDER_SUBJECT,
      subjectId: event.orderId,
      idempotencyKey: `${ACTIVITY_TYPES.orderShortfallReported}:${event.orderId}:${reportedAt}`,
      occurredAt: event.reportedAt,
      payload: {
        subjectLabel: event.reference,
        reportedBy: await staffCitation(this.actors, event.reportedBy),
        reportedAt,
        rank: event.rank,
        lines: event.lines.map((line) => ({ sku: line.sku, due: line.due, packed: line.packed })),
      },
    });
  }
}
