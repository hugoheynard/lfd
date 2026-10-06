import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  PRODUCTION_DAY_RETAKEN,
  ProductionDayRetakenEvent,
} from "../../../production/channels/delivery/index.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryDayReadiness } from "../../domain/entities/delivery-day-readiness.js";
import { DeliveryDayReadinessRepository } from "../../domain/ports/delivery-day-readiness.repository.js";
import { DayStopsLocator } from "../day-stops-locator.js";
import { PlanArrestedBell } from "../plan-arrested-bell.js";
import { activeDeliveriesAmong } from "./arrested-plan-deliveries.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const LEARN_RETAKEN_PLAN = "delivery.learn-retaken-plan";

/**
 * **La livraison apprend qu'un retirage complète le plan** (plan de
 * composition automatique, §16.5, CA6b ; canal `production/channels/delivery/`).
 *
 * Même discipline que `LearnArrestedPlan` : il ne calcule rien, il range
 * l'UNION des livraisons non annulées absorbées par le retirage, et sonne
 * seulement si l'ensemble grandit.
 *
 * - **Avant la clôture** (aucun ordre supposé entre les deux faits) : il crée
 *   la ligne sans instant d'arrêt et NE SONNE PAS. Un retirage implique une
 *   clôture ; quand elle arrivera, elle annoncera le total, celles-ci
 *   comprises. Sonner « nouvelles livraisons » d'un plan que le bureau n'a
 *   jamais vu arrêté lui donnerait un delta sans base.
 * - **Ancien fait sans liste** (écrit avant CA6b) : il ne fait rien et ne lève
 *   pas — le compte seul ne dit pas QUELLES commandes ranger, et un refus
 *   ferait un message mort pour un fait normal.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_DAY_RETAKEN, subscriber: LEARN_RETAKEN_PLAN })
export class LearnRetakenPlan implements DurableSubscriber {
  constructor(
    private readonly orders: DeliveryOrdersReader,
    private readonly days: DeliveryDayReadinessRepository,
    private readonly bell: PlanArrestedBell,
    private readonly clock: Clock,
    private readonly locating: DayStopsLocator,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayRetakenEvent.fromPayload(delivery.payload);
    if (event.orderIds === null) {
      return;
    }
    const deliveryIds = await activeDeliveriesAmong(this.orders, event.orderIds);
    const now = this.clock.now();
    const day =
      (await this.days.load(event.serviceDay)) ?? DeliveryDayReadiness.start(event.serviceDay, now);
    const announced = day.learnRetake(deliveryIds, now);
    await this.days.save(day);
    // CA0 : le rattrapage avant le jour J — ce qu'une commande n'a pas pu
    // situer à sa passation l'est ici, après la validation, hors transaction.
    this.locating.locateDaySoon(day.serviceDay);
    if (announced > 0) {
      await this.bell.ring({
        serviceDay: day.serviceDay,
        added: announced,
        total: day.deliveryCount,
        at: now,
      });
    }
  }
}
