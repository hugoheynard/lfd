import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  CurrentArrestHold,
  PRODUCTION_DAY_RETAKEN,
  ProductionDayRetakenEvent,
} from "../../../../production/channels/commerce/index.js";
import { DeliveryNoteFollowing } from "../../domain/ports/delivery-note-following.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PRODUCTION_DAY_RETAKEN = "lfc.orders.absorb-retaken-into-plan";

/**
 * **Le commerce apprend qu'un retirage a absorbé des commandes** et fait pour
 * elles ce que l'arrêt fait (`OnProductionDayClosed`) : il les confirme, puis
 * prévoit leur BL-1.
 *
 * Sans lui, une commande intégrée par un retirage (typiquement une commande
 * hors plan saisie par l'équipe) restait `placed` — modifiable par le client
 * alors que le fournil la produit — et le dossier tiré après le retirage
 * s'imprimait sans son BL, donc n'était jamais rangé.
 *
 * ## L'instant de l'ARRÊT, pas celui du retirage
 *
 * La commande porte `confirmedAt` = `closedAt` du fait, l'arrêt en vigueur.
 * C'est l'instant que la remise d'une réouverture cherche
 * (`releasableFromPlanWhere`) : confirmée à l'heure du retirage, elle ne
 * serait pas rendue au client, et le nouvel arrêt l'attendrait sans fin.
 *
 * ## Seulement l'arrêt en vigueur
 *
 * Comme l'arrêt : l'abonné tient le plan (`CurrentArrestHold`, verrou
 * partagé jusqu'au `COMMIT` du reçu) et ne fait rien si la journée a été
 * rouverte ou réarrêtée à un autre instant — le nouvel arrêt reprendra ces
 * commandes, encore `placed`. Un fait sans `closedAt` (écrit avant le champ)
 * ou sans liste d'envois ne confirme rien.
 *
 * Idempotent : `absorbIntoPlan` ne touche que les `placed` de la liste.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_DAY_RETAKEN, subscriber: ON_PRODUCTION_DAY_RETAKEN })
export class OnProductionDayRetaken implements DurableSubscriber {
  constructor(
    private readonly orders: OrderRepository,
    private readonly deliveryNotes: DeliveryNoteFollowing,
    private readonly arrest: CurrentArrestHold,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayRetakenEvent.fromPayload(delivery.payload);
    const { closedAt, shipments } = event;
    if (closedAt === null || shipments === null || shipments.length === 0) {
      return;
    }
    if (!(await this.arrest.holdIfCurrent(event.serviceDay, closedAt))) {
      return;
    }
    const orderIds = [...new Set(shipments.map((shipment) => shipment.orderId))];
    await this.orders.absorbIntoPlan(event.serviceDay, orderIds, closedAt);
    await this.deliveryNotes.planConfirmed(orderIds, closedAt);
  }
}
