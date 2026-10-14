import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ClosedPlansReader,
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
} from "../../../../production/channels/commerce/index.js";
import { OrderPlanRelease } from "../../domain/ports/order-plan-release.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PRODUCTION_DAY_REOPENED = "b2b.orders.release-from-plan";

/**
 * **Le commerce apprend qu'une journée est rouverte** (Hugo, 2026-10-14) :
 * les commandes que l'arrêt défait avait confirmées redeviennent `placed` —
 * modifiables, annulables, et comptées au prochain arrêt.
 *
 * ## Ne défaire qu'un plan qui n'a pas été refait
 *
 * La boîte d'envoi ne garantit aucun ordre. Si la journée est de nouveau
 * arrêtée quand le fait arrive, l'abonné ne fait RIEN : ses commandes sont au
 * nouveau plan (l'arrêt les a comptées, son abonné les a trouvées déjà
 * `confirmed`), et les rendre `placed` contredirait le fournil. Sinon, la
 * remise est bornée aux commandes confirmées à l'instant de l'arrêt défait —
 * idempotente, et sans effet sur une commande prête.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_DAY_REOPENED, subscriber: ON_PRODUCTION_DAY_REOPENED })
export class OnProductionDayReopened implements DurableSubscriber {
  constructor(
    private readonly release: OrderPlanRelease,
    private readonly plans: ClosedPlansReader,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayReopenedEvent.fromPayload(delivery.payload);
    const closed = await this.plans.closedBetween(event.serviceDay, event.serviceDay);
    if (closed.includes(event.serviceDay)) {
      return;
    }
    await this.release.releaseFromPlan(event.serviceDay, event.orderIds, event.closedAt);
  }
}
