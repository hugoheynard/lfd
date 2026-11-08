import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { MailRequest } from "../domain/entities/mail-request.js";
import { MailRequestRepository } from "../domain/ports/mail-request.repository.js";
import { RecordedMailDeliveries } from "../domain/ports/recorded-mail-deliveries.js";

/**
 * **Range l'issue d'un essai d'envoi**, et, si le fournisseur a rendu un
 * identifiant, applique d'abord les retours déjà rangés pour lui — dans la
 * même transaction que l'écriture (plan
 * `documentation/mail/plan-suivi-des-e-mails.md`, décision 2). Un rebond
 * arrivé avant cette écriture n'avait trouvé aucune demande : c'est ici
 * qu'il la trouve.
 *
 * Une demande acceptée à blanc (`provider_id` nul) n'a aucun retour à
 * attendre : elle est rangée telle quelle, sans retour inventé (décision 10 —
 * `dry_run` se dira à la lecture, T2).
 */
@Injectable()
export class MailOutcomeRecorder {
  constructor(
    private readonly requests: MailRequestRepository,
    private readonly recorded: RecordedMailDeliveries,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async save(request: MailRequest): Promise<void> {
    const providerId = request.providerId;
    if (providerId === null) {
      await this.requests.save(request);
      return;
    }
    await this.unitOfWork.run(async () => {
      for (const report of await this.recorded.recordedFor(providerId)) {
        request.recordDelivery(report);
      }
      await this.requests.save(request);
    });
  }
}
