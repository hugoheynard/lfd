import { Injectable } from "@nestjs/common";
import type { MailReceipt } from "@lfd/mailer";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  ImmediateMailInsideUnitOfWorkError,
  MailRequestAlreadySettledError,
} from "../domain/errors/mail-request.errors.js";
import { MailRequestRepository } from "../domain/ports/mail-request.repository.js";
import { UnitOfWorkProbe } from "../domain/ports/unit-of-work-probe.js";
import { MailSendAttempt } from "./mail-send-attempt.js";
import { type CheckedMailDemand, newMailRequest } from "./mail-requester.service.js";

/**
 * **Envoyer tout de suite** (plan C2, `sendAndAwaitReceipt`) — pour le geste du staff qui
 * lit le résultat à l'écran, l'essai et la sonde.
 *
 * Refusé sous une unité de travail : l'e-mail partirait pour une écriture
 * encore annulable. Le suivi s'écrit APRÈS l'envoi, dans sa propre écriture —
 * l'envoi ne tient donc aucune transaction ouverte le temps d'un aller-retour.
 *
 * Une clé déjà envoyée ne repart pas : son reçu est rendu tel qu'il a été
 * suivi. Une clé en échec (technique) est réessayée.
 */
@Injectable()
export class ImmediateMailSender {
  constructor(
    private readonly requests: MailRequestRepository,
    private readonly attempt: MailSendAttempt,
    private readonly unitOfWork: UnitOfWorkProbe,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async sendAndAwaitReceipt(demand: CheckedMailDemand): Promise<MailReceipt> {
    if (this.unitOfWork.isOpen()) {
      throw new ImmediateMailInsideUnitOfWorkError(demand.template);
    }
    const known = await this.requests.findByIdempotencyKey(demand.idempotencyKey);
    if (known?.status === "sent") {
      return { providerId: known.providerId };
    }
    if (known?.isSettled() === true) {
      throw new MailRequestAlreadySettledError(known.idempotencyKey, known.status);
    }
    const request = known ?? newMailRequest(demand, this.ids.next(), this.clock.now());
    const outcome = await this.attempt.attempt(request, demand);
    await this.requests.save(request);
    if (outcome.kind !== "sent") {
      throw outcome.error;
    }
    return { providerId: request.providerId };
  }
}
