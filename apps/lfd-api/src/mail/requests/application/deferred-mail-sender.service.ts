import { Injectable } from "@nestjs/common";

import type { MailRequest } from "../domain/entities/mail-request.js";
import type { OutgoingMail } from "../domain/ports/mail-dispatch.js";
import { type MailAttemptOutcome, MailSendAttempt } from "./mail-send-attempt.js";
import { MailOutcomeRecorder } from "./mail-outcome-recorder.js";

/**
 * **L'envoi d'une demande déjà passée en `sending`**, HORS de toute
 * transaction (plan `plan-service-e-mails.md`, § 8, point 2) : l'appel au
 * fournisseur avec la clé d'idempotence de la demande, puis une écriture
 * courte du résultat (`sent`, `refused`, `failed`) — la forme que `sendAndAwaitReceipt`
 * a déjà.
 *
 * Partagé par l'envoi d'après validation de l'abonné durable et par le
 * balayeur. Un envoi de même clé encore en cours chez le fournisseur ne
 * change rien : la demande reste `sending`, et rien n'est écrit.
 *
 * Il ne lève pas pour un échec d'envoi : l'issue est rangée au suivi, et
 * l'appelant la lit. Une écriture du résultat qui échoue, elle, remonte — la
 * demande reste `sending`, et le balayeur la reprendra.
 */
@Injectable()
export class DeferredMailSender {
  constructor(
    private readonly outcomes: MailOutcomeRecorder,
    private readonly attempt: MailSendAttempt,
  ) {}

  async send(request: MailRequest, mail: OutgoingMail): Promise<MailAttemptOutcome> {
    const outcome = await this.attempt.attempt(request, mail);
    if (outcome.kind !== "in-flight") {
      // Avec les retours déjà rangés pour son identifiant (suivi des e-mails, T1).
      await this.outcomes.save(request);
    }
    return outcome;
  }
}
