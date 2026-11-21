import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ORDER_REVIEWED,
  OrderReviewedFact,
} from "../../../orders/domain/events/order-reviewed.fact.js";
import { OrderAlertsAcknowledger } from "../../domain/ports/order-alerts.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ACKNOWLEDGE_REVIEWED_ORDER_ALERTS = "b2b.alerts.acknowledge-reviewed-order";

/**
 * Abonné des alertes : `order.reviewed` → **les alertes de la commande
 * sont acquittées** au nom de qui l'a visée, à l'instant du visa (plan du
 * visa des commandes, V4 : « vérifier une commande acquitte ses alertes »,
 * Hugo, 2026-11-21). Un seul geste pour le commercial.
 *
 * Durable : rejoué après un redémarrage. Seules les alertes encore en
 * attente sont touchées ; un rejeu ne réécrit pas l'auteur d'un
 * acquittement. Les commandes ne touchent pas la table des alertes.
 */
@Injectable()
@DurableHandler({ type: ORDER_REVIEWED, subscriber: ACKNOWLEDGE_REVIEWED_ORDER_ALERTS })
export class OnOrderReviewedAcknowledgeAlerts implements DurableSubscriber {
  constructor(private readonly alerts: OrderAlertsAcknowledger) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderReviewedFact.fromPayload(delivery.payload);
    await this.alerts.acknowledgeOrder(fact.orderId, fact.reviewedByStaffId, fact.reviewedAt);
  }
}
