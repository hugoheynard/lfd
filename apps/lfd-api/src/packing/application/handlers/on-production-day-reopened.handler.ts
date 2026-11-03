import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  ArrestedPlanHold,
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
} from "../../../production/channels/packing/index.js";
import { PackingListWithdrawal } from "../../domain/ports/packing-list-withdrawal.js";
import { PackingResupplyListing } from "../../domain/ports/packing-resupply-listing.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PRODUCTION_DAY_REOPENED = "packing.withdraw-reopened-list";

/**
 * **La liste à coliser d'une journée rouverte se retire** (Hugo,
 * 2026-10-14). Au prochain arrêt, le fournil la tirera de nouveau, commande
 * par commande, dans l'état du moment.
 *
 * Les fiches de réassort du plan défait (`resupplyIds`) se retirent de même,
 * dans la même unité de travail — par un statut daté de la réouverture.
 *
 * Rien si la journée est de nouveau arrêtée quand le fait arrive : la boîte
 * d'envoi ne garantit pas l'ordre, et le nouveau tirage est peut-être déjà
 * inscrit — le retirer viderait le colisage d'un plan bien vivant.
 *
 * 🔴 **Sous le verrou du plan** (audit final du réassort, 2026-11-03). La
 * question « est-elle de nouveau arrêtée ? » se lisait sans verrou
 * (`ClosedPlansReader`) : un réarrêt validé entre elle et le retrait laissait
 * retirer le colisage du nouveau plan. Elle se lit désormais par
 * `ArrestedPlanHold`, dans la transaction du reçu et jusqu'à son `COMMIT` :
 * un réarrêt en cours (verrou exclusif) est attendu puis vu, et un réarrêt
 * qui arrive après attend que le retrait soit validé.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_DAY_REOPENED, subscriber: ON_PRODUCTION_DAY_REOPENED })
export class OnProductionDayReopened implements DurableSubscriber {
  constructor(
    private readonly withdrawal: PackingListWithdrawal,
    private readonly plan: ArrestedPlanHold,
    private readonly resupplies: PackingResupplyListing,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayReopenedEvent.fromPayload(delivery.payload);
    if ((await this.plan.hold(event.serviceDay)) === "arrested") {
      return;
    }
    await this.withdrawal.withdrawUntouched(event.serviceDay, event.orderIds);
    await this.resupplies.withdrawUntouched(event.serviceDay, event.resupplyIds, event.reopenedAt);
  }
}
