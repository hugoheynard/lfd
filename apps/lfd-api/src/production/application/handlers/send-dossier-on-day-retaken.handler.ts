import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  PRODUCTION_DAY_RETAKEN,
  ProductionDayRetakenEvent,
} from "../../channels/delivery/index.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { DossierDispatch, type DossierOccasion } from "../services/dossier-dispatch.service.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_DOSSIER_ON_DAY_RETAKEN = "production.send-dossier-on-retake";

/**
 * **Le tirage est repris : le dossier complété repart** (plan
 * `documentation/production/dossier-prod-du-jour.md`, décision 2, E3),
 * objet « — complété ».
 *
 * Un retirage dépassé depuis par un autre (la journée garde un `retaken.at`
 * plus récent) est écarté : le fait du dernier enverra le dossier à jour, et
 * le dossier archivé de ce tirage-ci n'est plus celui qu'on relit.
 *
 * 🔴 **Le dossier part APRÈS la validation du reçu** (2026-10-07, audit B1),
 * comme à l'arrêt (`SendDossierOnDayClosed`) : la journée et les destinataires
 * sont lus dans la transaction de la garde — illisibles, la livraison échoue
 * et sera rejouée ; le papier, la trace et les envois suivent la validation,
 * hors transaction.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_DAY_RETAKEN, subscriber: SEND_DOSSIER_ON_DAY_RETAKEN })
export class SendDossierOnDayRetaken implements DurableSubscriber {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly dispatch: DossierDispatch,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ProductionDayRetakenEvent.fromPayload(delivery.payload);
    const day = await this.days.load(ServiceDay.of(event.serviceDay));
    if (day.retaken?.at.getTime() !== event.retakenAt.getTime()) {
      return;
    }
    const prepared = await this.dispatch.prepare();
    const occasion: DossierOccasion = { at: event.retakenAt, completed: true };
    this.afterCommit.defer(
      () =>
        this.work.track(
          this.dispatch.deliver(prepared, day, occasion),
          SEND_DOSSIER_ON_DAY_RETAKEN,
        ),
      SEND_DOSSIER_ON_DAY_RETAKEN,
    );
  }
}
