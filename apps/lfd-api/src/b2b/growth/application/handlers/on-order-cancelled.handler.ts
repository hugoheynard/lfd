import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_CANCELLED,
  OrderCancelledEvent,
} from "../../../orders/domain/events/order-cancelled.event.js";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { ActorNamer } from "../../domain/ports/actor-namer.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel, staffCitation } from "./order-fact-names.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RECORD_ORDER_CANCELLED = "b2b.growth.record-order-cancelled";

/**
 * Abonné du journal : `order.cancelled` → **le témoin immuable d'une
 * annulation par l'équipe** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.5, D10).
 *
 * Même raison que l'abandon et le retrait : une annulation qui ne vivrait que
 * sur des colonnes qu'on peut réécrire n'atteste rien. Le sujet est le client ;
 * la charge dit qui a annulé (la fiche, sous son nom du moment), pourquoi, et
 * sous quel régime, et ce qu'il est advenu du bon de fidélité (lot C3b). Visible dans l'historique du détail staff, qui lit le
 * journal par `orderId`.
 *
 * C'est aussi la « croissance soustraite » de S5 : le journal EST ce que la
 * croissance lit, et aucun score ne lit encore une commande morte
 * (`ACTIVITY_TYPES.orderAbandoned`, vérifié le 2026-10-12).
 *
 * Lot C6 (C6.6) : le CLIENT peut annuler. `cancelledBy` est alors `null`, et
 * la charge cite le client (`cancelledByCustomer`, sous son nom du moment) à
 * la place de la fiche staff, avec le motif choisi et le délai appliqué. Un
 * fait d'avant C6 se relit `staff` (S8) et se journalise comme avant.
 *
 * Durable, comme `OnOrderHandedOver` : `record` reste best-effort, la clé
 * d'idempotence garde un seul témoin par commande, rejeu compris.
 */
@Injectable()
@DurableHandler({ type: ORDER_CANCELLED, subscriber: RECORD_ORDER_CANCELLED })
export class OnOrderCancelled implements DurableSubscriber {
  constructor(
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
    private readonly actors: ActorNamer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderCancelledEvent.fromPayload(delivery.payload);
    const subject = await customerLabel(this.customers, event.placedByUserId);
    const by =
      event.cancelledBy === null ? null : await staffCitation(this.actors, event.cancelledBy);
    await this.recorder.record({
      type: ACTIVITY_TYPES.orderCancelled,
      subjectType: "user",
      subjectId: event.placedByUserId,
      idempotencyKey: `${ACTIVITY_TYPES.orderCancelled}:${event.orderId}`,
      payload: {
        ...subject,
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        cancelledBy: by,
        reason: event.reason,
        regime: event.regime,
        voucher:
          event.voucher === null
            ? null
            : { ...event.voucher, expiresAt: event.voucher.expiresAt.toISOString() },
        refund: event.refund,
        ...(await this.customerAuthor(event)),
      },
    });
  }

  /**
   * Qui, côté client, a annulé — et ce qu'il a choisi. Rien pour l'équipe :
   * la charge d'une annulation staff garde exactement sa forme d'avant C6.
   */
  private async customerAuthor(event: OrderCancelledEvent): Promise<Record<string, unknown>> {
    if (event.cancelledByKind === "staff" || event.cancelledByUserId === null) {
      return {};
    }
    const named = await customerLabel(this.customers, event.cancelledByUserId);
    return {
      cancelledByKind: event.cancelledByKind,
      cancelledByCustomer:
        named.subjectLabel === undefined
          ? event.cancelledByUserId
          : { id: event.cancelledByUserId, name: named.subjectLabel },
      reasonCode: event.reasonCode,
      policy: event.policy,
    };
  }
}
