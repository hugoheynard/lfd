import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  PRODUCTION_DAY_RETAKEN,
  ProductionDayRetakenEvent,
} from "../../domain/events/production-day-retaken.event.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { DossierDispatch } from "../services/dossier-dispatch.service.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_DOSSIER_ON_DAY_RETAKEN = "production.send-dossier-on-retake";

/**
 * **Le tirage est repris : le dossier complété repart** (plan
 * `documentation/production/plan-envoi-du-dossier.md`, décision 2, E3),
 * objet « — complété ».
 *
 * Un retirage dépassé depuis par un autre (la journée garde un `retaken.at`
 * plus récent) est écarté : le fait du dernier enverra le dossier à jour, et
 * le dossier archivé de ce tirage-ci n'est plus celui qu'on relit.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_DAY_RETAKEN, subscriber: SEND_DOSSIER_ON_DAY_RETAKEN })
export class SendDossierOnDayRetaken implements DurableSubscriber {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly dispatch: DossierDispatch,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayRetakenEvent.fromPayload(delivery.payload);
    const day = await this.days.load(ServiceDay.of(event.serviceDay));
    if (day.retaken?.at.getTime() !== event.retakenAt.getTime()) {
      return;
    }
    await this.dispatch.dispatch(day, { at: event.retakenAt, completed: true });
  }
}
