import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
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
import { DossierDispatch, type DossierOccasion } from "../services/dossier-dispatch.service.js";

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
 * 🔴 **Le dossier part APRÈS la validation du reçu** (2026-10-07, audit B1).
 * La journée et les destinataires sont lus dans la transaction de la garde —
 * illisibles, la livraison échoue et sera rejouée ; le papier, la trace et
 * les envois suivent la validation, hors transaction (`DossierDispatch`).
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
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
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
    const prepared = await this.dispatch.prepare();
    const occasion: DossierOccasion = { at: event.closedAt, completed: false };
    this.afterCommit.defer(
      () =>
        this.work.track(this.dispatch.deliver(prepared, day, occasion), SEND_DOSSIER_ON_DAY_CLOSED),
      SEND_DOSSIER_ON_DAY_CLOSED,
    );
  }
}
