import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  PRODUCTION_DAY_CLOSED,
  ProductionDayClosedEvent,
} from "../../../production/channels/delivery/index.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryDayReadiness } from "../../domain/entities/delivery-day-readiness.js";
import { DeliveryDayReadinessRepository } from "../../domain/ports/delivery-day-readiness.repository.js";
import { PlanArrestedBell } from "../plan-arrested-bell.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const LEARN_ARRESTED_PLAN = "delivery.learn-arrested-plan";

/**
 * **La livraison apprend que le plan est arrêté** (plan de composition
 * automatique, §16.5, CA6a ; arête `delivery → production` par le canal
 * `production/channels/delivery/`, §15).
 *
 * Il ne CALCULE rien — l'abonné tourne dans une transaction, et la
 * proposition appelle le réseau (B1). Il range et il sonne :
 *
 * - borné aux `orderIds` DU FAIT, jamais au statut `confirmed` (l'abonné du
 *   commerce peut ne pas être passé) ;
 * - n'en garde que les livraisons NON annulées, lues au commerce par le canal ;
 * - en fait l'UNION dans l'ensemble du jour (`DeliveryDayReadiness`) ;
 * - sonne seulement si l'ensemble a grandi.
 *
 * Aucun ordre supposé, idempotent : un fait rejoué ou une réannonce qui
 * recouvre n'ajoute rien, donc ne sonne pas. Il ne lève sur aucun cas métier ;
 * seul un fait illisible échoue, et finit en message mort visible.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_DAY_CLOSED, subscriber: LEARN_ARRESTED_PLAN })
export class LearnArrestedPlan implements DurableSubscriber {
  constructor(
    private readonly orders: DeliveryOrdersReader,
    private readonly days: DeliveryDayReadinessRepository,
    private readonly bell: PlanArrestedBell,
    private readonly clock: Clock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayClosedEvent.fromPayload(delivery.payload);
    const facts = event.orderIds.length === 0 ? [] : await this.orders.byIds(event.orderIds);
    const deliveryIds = facts
      .filter((order) => order.delivery && order.status === "active")
      .map((order) => order.orderId);
    const now = this.clock.now();
    const day =
      (await this.days.load(event.serviceDay)) ?? DeliveryDayReadiness.start(event.serviceDay, now);
    const added = day.learnClosure(event.closedAt, deliveryIds, now);
    await this.days.save(day);
    if (added > 0) {
      await this.bell.ring({
        serviceDay: day.serviceDay,
        added,
        total: day.deliveryCount,
        at: now,
      });
    }
  }
}
