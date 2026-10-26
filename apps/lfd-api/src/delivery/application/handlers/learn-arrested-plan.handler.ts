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
  ShipmentRef,
} from "../../../production/channels/delivery/index.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryDayReadiness } from "../../domain/entities/delivery-day-readiness.js";
import { DeliveryDayReadinessRepository } from "../../domain/ports/delivery-day-readiness.repository.js";
import { DayStopsLocator } from "../day-stops-locator.js";
import { PlanArrestedBell } from "../plan-arrested-bell.js";
import { TransferAttachment } from "../transfer-attachment.js";
import { activeDeliveriesAmong } from "./arrested-plan-deliveries.js";

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
 * - range au transfert de leur point les retraits d'un site servi par
 *   transfert, et les réassorts figés (`resupplyIds` du fait, lot R3c) ;
 * - n'en garde que les livraisons NON annulées, lues au commerce par le canal ;
 * - en fait l'UNION dans l'ensemble du jour (`DeliveryDayReadiness`) ;
 * - sonne seulement si l'ensemble a grandi — à la première clôture reçue,
 *   tout l'ensemble, y compris ce qu'un retirage arrivé avant elle a rangé.
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
    private readonly locating: DayStopsLocator,
    private readonly attachment: TransferAttachment,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayClosedEvent.fromPayload(delivery.payload);
    const deliveryIds = await activeDeliveriesAmong(this.orders, event.orderIds);
    const now = this.clock.now();
    // Les retraits des sites servis par transfert rejoignent leur transfert
    // (lot T1) ; la composition, après la validation, les placera.
    await this.attachment.attachAmong(event.orderIds);
    // Les réassorts figés d'un point servi par transfert (réassort, R3c) : à
    // partir de la liste DU FAIT, un point sans commande compris.
    await this.attachment.attachResupplies(event.serviceDay, event.resupplyIds);
    const day =
      (await this.days.load(event.serviceDay)) ?? DeliveryDayReadiness.start(event.serviceDay, now);
    // La clôture ne nomme que des commandes : chacune est l'envoi de rang 1
    // (un reliquat du jour entrera par les sources du jour, plan E7, L7).
    const shipments = deliveryIds.map((orderId) => ShipmentRef.firstOf(orderId));
    const announced = day.learnClosure(event.closedAt, shipments, now);
    await this.days.save(day);
    // CA0 : le rattrapage avant le jour J — ce qu'une commande n'a pas pu
    // situer à sa passation l'est ici, après la validation, hors transaction.
    this.locating.prepareDaySoon(day.serviceDay);
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
