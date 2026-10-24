import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  PRODUCTION_DAY_CLOSED,
  ProductionDayClosedEvent,
} from "../../../../production/channels/commerce/index.js";
import { DeliveryNoteFollowing } from "../../domain/ports/delivery-note-following.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PRODUCTION_DAY_CLOSED = "b2b.orders.absorb-into-plan";

/**
 * **Le commerce apprend qu'une journée est partie en fabrication.**
 *
 * ## Pourquoi l'abonné vit ICI
 *
 * `confirmed` est un fait du commerce : c'est son énuméré, sa table, sa règle.
 * La production ne l'écrit pas — elle publie que la journée est arrêtée, et le
 * commerce en tire ce qui le concerne. Chaque contexte n'écrit QUE ses tables.
 *
 * ## Abonné DURABLE depuis le 2026-10-04
 *
 * Jusque-là, le fait passait par le bus en mémoire, « ni persisté ni rejoué » :
 * un container qui tombait entre la publication et l'écriture laissait des
 * commandes `placed` sur une journée close, et seule une re-clôture humaine
 * rattrapait. Le fait est désormais écrit dans la boîte d'envoi avec la clôture
 * (plan `documentation/journalisation/plan-boite-d-envoi.md`) : livré au moins
 * une fois, et la garde du relais pose le reçu dans la même unité de travail
 * que l'écriture — un doublon est sauté.
 *
 * ## Idempotent pour de vrai
 *
 * La garde couvre une seconde livraison du MÊME fait ; l'écriture couvre deux
 * faits différents (clôture puis réannonce) : `status: placed` dans le `where`,
 * et bornée aux `orderIds` de l'instantané. Avant cette borne, l'effet dépendait
 * de l'heure de livraison : une reprise tardive confirmait aussi les commandes
 * passées après l'arrêt, que le fournil n'avait pas comptées.
 *
 * ## Le bon de livraison prévu (plan E1, 2026-10-24)
 *
 * Après l'absorption, dans la MÊME unité de travail (celle du reçu), chaque
 * commande que cet arrêt a confirmée — `confirmedAt = closedAt` — reçoit son
 * BL-1 prévu, ou voit son BL-1 encore prévu réécrit sur ses lignes
 * (`documentation/commandes/plan-e1-bon-de-livraison-prevu.md`, § 6). Une
 * commande écartée par `planWhere` n'est pas confirmée, donc n'a pas de BL.
 *
 * Le relais l'inscrit à `BackgroundWork` : c'est ce que `lint:events-tracked`
 * vérifie sur un `@DurableHandler`.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_DAY_CLOSED, subscriber: ON_PRODUCTION_DAY_CLOSED })
export class OnProductionDayClosed implements DurableSubscriber {
  constructor(
    private readonly orders: OrderRepository,
    private readonly deliveryNotes: DeliveryNoteFollowing,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayClosedEvent.fromPayload(delivery.payload);
    // L'instant du SNAPSHOT, pas celui de la réception : deux commandes
    // absorbées par la même clôture portent la même heure, y compris quand le
    // relais livre une heure plus tard ou lors d'une réannonce.
    await this.orders.absorbIntoPlan(event.serviceDay, event.orderIds, event.closedAt);
    await this.deliveryNotes.planConfirmed(event.orderIds, event.closedAt);
  }
}
