import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  PRODUCTION_RESUPPLY_LAUNCHED,
  ResupplyLaunchedEvent,
} from "../../../production/channels/delivery/index.js";
import { DeliveryDayReadiness } from "../../domain/entities/delivery-day-readiness.js";
import { DeliveryDayReadinessRepository } from "../../domain/ports/delivery-day-readiness.repository.js";
import { AsapTransferDispatch } from "../asap-transfer-dispatch.js";
import { TransferAttachment } from "../transfer-attachment.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ATTACH_LAUNCHED_RESUPPLY = "delivery.attach-launched-resupply";

/**
 * **La livraison emporte un réassort « au plus tôt » lancé** (R4c,
 * `reassort-boutiques/plan-au-plus-tot.md` §2 ④ ; arête `delivery →
 * production` par `production/channels/delivery/`, comme `day_closed`).
 *
 * Les mécanismes du soir, sans réinvention (S6 de `vitruve`) :
 *
 * - `TransferAttachment.attachResupplies` range le réassort au premier
 *   transfert NON PARTI de son point et du jour, ou en ouvre un (Q3 : pas de
 *   seuil) — lu dans la copie figée au lancement, jamais l'état du commerce ;
 * - le placement de fond (`AsapTransferDispatch`, sur `placeDay`) le met dans
 *   une tournée intégrée ou dédiée, et sonne chez le répartiteur s'il reste
 *   sans arrêt.
 *
 * Seulement si `servedByTransfer` : le Labo est servi sur place (« Monté »).
 *
 * **La journée ouverte par ce lancement** (Q5) : le fournil ne publie pas
 * `production.day_closed` (il renverrait le dossier, Q6). Le fait porte
 * `openedPlan`, et c'est ici que la livraison apprend l'arrêt — à l'instant
 * du lancement, sans livraison à annoncer, donc sans cloche du plan arrêté.
 *
 * Idempotent : un fait rejoué ne range rien deux fois, et l'arrêt déjà connu
 * ne bouge pas.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_RESUPPLY_LAUNCHED, subscriber: ATTACH_LAUNCHED_RESUPPLY })
export class AttachLaunchedResupply implements DurableSubscriber {
  constructor(
    private readonly days: DeliveryDayReadinessRepository,
    private readonly clock: Clock,
    private readonly attachment: TransferAttachment,
    private readonly dispatch: AsapTransferDispatch,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ResupplyLaunchedEvent.fromPayload(delivery.payload);
    if (event.openedPlan) {
      await this.learnOpenedPlan(event.serviceDay, event.launchedAt);
    }
    if (!event.resupply.servedByTransfer) {
      return;
    }
    const { resupplyId, name } = event.resupply;
    await this.attachment.attachResupplies(event.serviceDay, [resupplyId]);
    this.dispatch.placeSoon({ serviceDay: event.serviceDay, resupplyId, name });
  }

  private async learnOpenedPlan(serviceDay: string, launchedAt: Date): Promise<void> {
    const now = this.clock.now();
    const day = (await this.days.load(serviceDay)) ?? DeliveryDayReadiness.start(serviceDay, now);
    day.learnClosure(launchedAt, [], now);
    await this.days.save(day);
  }
}
