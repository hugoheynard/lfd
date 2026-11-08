import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DurableFactPayloads } from "../../../platform/outbox/durable-fact-payloads.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  MAIL_RESUME_WINDOW_MS,
  MAX_MAIL_ATTEMPTS,
  type MailRequest,
} from "../domain/entities/mail-request.js";
import { MailRequestRepository } from "../domain/ports/mail-request.repository.js";
import { StalledMailRequests } from "../domain/ports/stalled-mail-requests.js";
import { DeferredMailSender } from "./deferred-mail-sender.service.js";
import { MailDeliveryApplier } from "./mail-delivery-applier.js";
import { mailRequestedKey, outgoingMailOf } from "./mail-requested.fact.js";
import { type MailSweepReport, SweepMailRequestsCommand } from "./sweep-mail-requests.command.js";

/**
 * Depuis combien de temps une tentative doit être engagée pour être reprise.
 * Plus long qu'un envoi lent (trois essais du mailer sur un 429, 30 s
 * d'attente au plus chacun) : un envoi d'après validation encore en route
 * n'est pas un orphelin.
 */
export const MAIL_STALE_AFTER_MS = 10 * 60 * 1000;

/** Les demandes d'un passage : le cron repasse dans cinq minutes. */
export const MAIL_SWEEP_BATCH = 20;

type Issue = "sent" | "refused" | "failed" | "inFlight" | "abandoned" | "missingFact";

const EMPTY: MailSweepReport = {
  examined: 0,
  sent: 0,
  refused: 0,
  failed: 0,
  inFlight: 0,
  abandoned: 0,
  missingFact: 0,
  deliveriesApplied: 0,
};

/**
 * **Le balayeur des e-mails** (plan `plan-service-e-mails.md`, § 8, point 3).
 *
 * Reprend, avec la même clé d'idempotence, les envois différés en retard : un
 * `sending` orphelin (l'envoi d'après validation n'a pas eu lieu —
 * redémarrage) et un `failed` reprenable. Par lot borné, les plus anciens
 * d'abord. Ce qui dépasse 23 h depuis la première tentative, ou le plafond
 * d'essais, passe `failed` sans renvoi : la clé de Resend expire à 24 h, un
 * renvoi pourrait doubler l'e-mail.
 *
 * Chaque reprise : `sending` rangé d'abord (écriture courte), puis l'envoi
 * hors transaction, puis le résultat. Deux passages qui se chevauchent
 * peuvent prendre la même demande ; ils envoient alors avec la même clé, et
 * Resend n'en garde qu'un (ou rend un 409, qui laisse la demande `sending`).
 *
 * Il applique aussi les retours du fournisseur rangés mais manqués (plan
 * `plan-suivi-des-e-mails.md`, décision 2) : un rebond arrivé pendant
 * l'écriture de l'envoi, ou dont l'application a échoué.
 *
 * @sans-journal geste machine, idempotent ; le compte rendu, rendu et
 * journalisé au log, est sa trace, et le suivi porte chaque transition.
 */
@CommandHandler(SweepMailRequestsCommand)
export class SweepMailRequestsHandler implements ICommandHandler<
  SweepMailRequestsCommand,
  MailSweepReport
> {
  private readonly logger = new Logger(SweepMailRequestsHandler.name);

  constructor(
    private readonly stalled: StalledMailRequests,
    private readonly requests: MailRequestRepository,
    private readonly payloads: DurableFactPayloads,
    private readonly sender: DeferredMailSender,
    private readonly deliveries: MailDeliveryApplier,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<MailSweepReport> {
    const now = this.clock.now();
    const due = await this.stalled.due({
      attemptedBefore: new Date(now.getTime() - MAIL_STALE_AFTER_MS),
      firstAttemptSince: new Date(now.getTime() - MAIL_RESUME_WINDOW_MS),
      maxAttempts: MAX_MAIL_ATTEMPTS,
      limit: MAIL_SWEEP_BATCH,
    });
    let report: MailSweepReport = { ...EMPTY, examined: due.length };
    for (const request of due) {
      const issue = await this.sweepOne(request, now);
      report = { ...report, [issue]: report[issue] + 1 };
    }
    report = { ...report, deliveriesApplied: await this.deliveries.applyUnapplied() };
    if (report.examined > 0 || report.deliveriesApplied > 0) {
      this.logger.log(`Balayage des e-mails : ${JSON.stringify(report)}`);
    }
    return report;
  }

  private async sweepOne(request: MailRequest, now: Date): Promise<Issue> {
    if (!request.canResume(now)) {
      // Seul un `sending` arrive ici hors fenêtre : la lecture écarte les
      // `failed` qui ne se reprennent plus, et ceux-là sont déjà visibles.
      if (request.status !== "sending") {
        return "failed";
      }
      request.giveUp(now);
      await this.requests.save(request);
      return "abandoned";
    }
    const payload = await this.payloads.payloadOf(mailRequestedKey(request.idempotencyKey));
    if (payload === null) {
      this.logger.error(
        `Demande d'e-mail « ${request.idempotencyKey} » sans son fait d'origine : non reprise.`,
      );
      return "missingFact";
    }
    const mail = outgoingMailOf(payload);
    request.beginSending(now);
    await this.requests.save(request);
    const outcome = await this.sender.send(request, mail);
    return outcome.kind === "in-flight" ? "inFlight" : outcome.kind;
  }
}
