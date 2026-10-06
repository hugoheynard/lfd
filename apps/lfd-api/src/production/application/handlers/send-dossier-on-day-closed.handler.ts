import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  PRODUCTION_DAY_CLOSED,
  ProductionDayClosedEvent,
} from "../../channels/commerce/production-day-closed.event.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { DossierDispatch } from "../services/dossier-dispatch.service.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_DOSSIER_ON_DAY_CLOSED = "production.send-dossier-on-close";

/**
 * **Le plan est arrêté : le dossier du jour part** (plan
 * `documentation/production/dossier-prod-du-jour.md`, décision 2, E3) — à
 * chaque arrêt, manuel ou automatique, les deux publiant `production.day_closed`.
 *
 * Abonné DURABLE dans le bloc qui publie : `lint:durable-cross-block` ne vise
 * que les `@EventsHandler` qui traversent un bloc, et n'a donc pas d'avis
 * (vérifié le 2026-10-06). Durable quand même parce qu'un e-mail perdu entre
 * la clôture et l'envoi ne se verrait nulle part.
 *
 * Deux faits du même type sont écartés :
 *
 * - **une réannonce** (`reannouncedAt` posé) : un geste de réparation pour le
 *   commerce, pas un nouvel arrêt — le dossier est déjà parti ;
 * - **une clôture reprise depuis** (la journée porte un retirage) : le fait du
 *   retirage enverra le dossier complété, et l'envoyer ici sous l'objet de
 *   l'arrêt ferait partir le même papier deux fois sous deux noms.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_DAY_CLOSED, subscriber: SEND_DOSSIER_ON_DAY_CLOSED })
export class SendDossierOnDayClosed implements DurableSubscriber {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly dispatch: DossierDispatch,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayClosedEvent.fromPayload(delivery.payload);
    if (event.reannouncedAt !== null) {
      return;
    }
    const day = await this.days.load(ServiceDay.of(event.serviceDay));
    if (!day.isClosed || day.retaken !== null) {
      return;
    }
    await this.dispatch.dispatch(day, { at: event.closedAt, completed: false });
  }
}
