import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import type { MailDeliveryReport } from "../domain/value-objects/mail-delivery.js";
import { MailRequestRepository } from "../domain/ports/mail-request.repository.js";
import { UnappliedMailDeliveries } from "../domain/ports/unapplied-mail-deliveries.js";

/** Les retours qu'un passage du balayeur applique : le cron repasse dans cinq minutes. */
export const MAIL_DELIVERY_SWEEP_BATCH = 100;

/**
 * Jusqu'où le balayeur regarde en arrière : la durée de vie d'un retour
 * orphelin (30 jours, décision 2). Au-delà, un retour manqué l'a été par un
 * balayeur arrêté un mois — et la lecture reste bornée.
 */
export const MAIL_DELIVERY_SWEEP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * **Applique un retour du fournisseur aux demandes qui portent son
 * identifiant** (`documentation/mail/le-suivi-des-e-mails.md`,
 * décisions 2 et 3) : charger, `recordDelivery` (qui ne relève que vers le
 * haut), ranger. Partagé par le webhook, qui applique ce qu'il vient de
 * ranger, et par le balayeur, qui applique ce qui a été manqué.
 *
 * Deux applications concurrentes sur la même demande peuvent se marcher
 * dessus (lecture puis écriture) ; le balayeur relit alors le retour le plus
 * grave, qui reste plus grave que celui rangé, et le réapplique.
 */
@Injectable()
export class MailDeliveryApplier {
  constructor(
    private readonly requests: MailRequestRepository,
    private readonly unapplied: UnappliedMailDeliveries,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /** @returns combien de demandes ont changé. */
  async apply(providerId: string, report: MailDeliveryReport): Promise<number> {
    return this.unitOfWork.run(async () => {
      let changed = 0;
      for (const request of await this.requests.findByProviderId(providerId)) {
        if (request.recordDelivery(report)) {
          await this.requests.save(request);
          changed += 1;
        }
      }
      return changed;
    });
  }

  /** Le passage du balayeur : les retours manqués, par lot borné. */
  async applyUnapplied(): Promise<number> {
    let changed = 0;
    const since = new Date(this.clock.now().getTime() - MAIL_DELIVERY_SWEEP_WINDOW_MS);
    for (const pending of await this.unapplied.due(since, MAIL_DELIVERY_SWEEP_BATCH)) {
      changed += await this.apply(pending.providerId, pending.report);
    }
    return changed;
  }
}
