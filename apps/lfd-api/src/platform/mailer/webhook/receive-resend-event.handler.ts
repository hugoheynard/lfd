import { Inject, Logger, Optional } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../config/app-config.js";
import { Clock } from "../../time/clock.js";
import { InboundMailSink, type InboundMailNotice } from "../inbound/inbound-mail.sink.js";
import { InboundSinkMissingError } from "../inbound/inbound-sink-missing.error.js";
import { MailJournal } from "../journal/mail-journal.port.js";
import {
  ReceiveResendEventCommand,
  type ResendEventReceipt,
} from "./receive-resend-event.command.js";
import { readReceivedEmail, readResendEvent } from "./resend-event.js";
import { verifySvixSignature } from "./svix-signature.js";

/** Le fournisseur, tel qu'inscrit au registre des messages déjà vus. */
const PROVIDER = "resend";

/**
 * Prouve l'origine d'un webhook Resend, puis le traite **une seule fois**.
 *
 * On ne rejette **jamais** au-delà du refus de signature : un `5xx` ferait
 * réessayer Resend, et aucune reprise ne rendra lisible un événement illisible.
 *
 * 🔴 **Sauf un e-mail REÇU** (`email.received`, plan
 * `plan-reponses-par-e-mail.md`, §3) : il est remis au port
 * `InboundMailSink` SANS consommer le `svix-id`. Consommé d'abord, un
 * rangement qui échoue serait rejoué par Resend… et ignoré : la réponse du
 * client serait perdue. L'échec remonte donc (Resend rejoue), et
 * l'idempotence est celle du rangement — l'identifiant du message, unique.
 *
 * @sans-journal le journal des e-mails EST la trace : c'est lui qu'on écrit.
 */
@CommandHandler(ReceiveResendEventCommand)
export class ReceiveResendEventHandler implements ICommandHandler<
  ReceiveResendEventCommand,
  ResendEventReceipt
> {
  private readonly logger = new Logger(ReceiveResendEventHandler.name);

  constructor(
    @Inject(AppConfig) private readonly config: Pick<AppConfig, "mailerConfig">,
    private readonly journal: MailJournal,
    private readonly clock: Clock,
    // Jeton explicite : sous une union `| null`, la métadonnée de type vaut
    // `Object`, et Nest injecterait silencieusement `null`.
    @Optional() @Inject(InboundMailSink) private readonly inbound: InboundMailSink | null = null,
  ) {}

  async execute(command: ReceiveResendEventCommand): Promise<ResendEventReceipt> {
    const verdict = verifySvixSignature({
      secret: this.config.mailerConfig().webhookSecret,
      headers: command.headers,
      body: command.body,
      nowMs: this.clock.now().getTime(),
    });
    if (verdict !== "ok") {
      // Le motif reste dans le journal, jamais dans la réponse : le dire à
      // l'appelant lui apprendrait à s'approcher.
      this.logger.warn(`Webhook Resend refusé (${verdict})`);
      return "refused";
    }
    await this.consume(command.headers.id ?? "", command.body);
    return "accepted";
  }

  private async consume(externalId: string, body: string): Promise<void> {
    const payload = parse(body);
    const received = readReceivedEmail(payload);
    if (received !== null) {
      await this.deliver(received);
      return;
    }
    if (!(await this.journal.rememberEvent(PROVIDER, externalId))) {
      // Svix réessaie : le traiter deux fois compterait deux rebonds pour un.
      return;
    }
    const event = readResendEvent(payload);
    if (event === null) {
      return;
    }
    await this.journal.recordOutcome({
      providerId: event.providerId,
      status: event.status,
      detail: event.detail,
      at: this.clock.now(),
    });
  }

  /** Le port relié par `appBootstrap` ; absent, l'e-mail n'est pas perdu : Resend rejouera. */
  private async deliver(notice: InboundMailNotice): Promise<void> {
    if (this.inbound === null) {
      throw new InboundSinkMissingError(notice.emailId);
    }
    await this.inbound.accept(notice);
  }
}

/** Un JSON illisible n'est pas une panne : c'est un message qu'on ignore. */
function parse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
