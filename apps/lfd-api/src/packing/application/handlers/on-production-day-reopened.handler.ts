import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  ClosedPlansReader,
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
} from "../../../production/channels/packing/index.js";
import { PackingListWithdrawal } from "../../domain/ports/packing-list-withdrawal.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PRODUCTION_DAY_REOPENED = "packing.withdraw-reopened-list";

/**
 * **La liste à coliser d'une journée rouverte se retire** (Hugo,
 * 2026-10-14). Au prochain arrêt, le fournil la tirera de nouveau, commande
 * par commande, dans l'état du moment.
 *
 * Rien si la journée est de nouveau arrêtée quand le fait arrive : la boîte
 * d'envoi ne garantit pas l'ordre, et le nouveau tirage est peut-être déjà
 * inscrit — le retirer viderait le colisage d'un plan bien vivant.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_DAY_REOPENED, subscriber: ON_PRODUCTION_DAY_REOPENED })
export class OnProductionDayReopened implements DurableSubscriber {
  constructor(
    private readonly withdrawal: PackingListWithdrawal,
    private readonly plans: ClosedPlansReader,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayReopenedEvent.fromPayload(delivery.payload);
    const closed = await this.plans.closedBetween(event.serviceDay, event.serviceDay);
    if (closed.includes(event.serviceDay)) {
      return;
    }
    await this.withdrawal.withdrawUntouched(event.serviceDay, event.orderIds);
  }
}
