import { Inject, Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../config/app-config.js";
import { Clock } from "../../time/clock.js";
import { MailJournal } from "../journal/mail-journal.port.js";
import {
  ReceiveResendEventCommand,
  type ResendEventReceipt,
} from "./receive-resend-event.command.js";
import { readResendEvent } from "./resend-event.js";
import { verifySvixSignature } from "./svix-signature.js";

/** Le fournisseur, tel qu'inscrit au registre des messages déjà vus. */
const PROVIDER = "resend";

/**
 * Prouve l'origine d'un webhook Resend, puis le traite **une seule fois**.
 *
 * On ne rejette **jamais** au-delà du refus de signature : un `5xx` ferait
 * réessayer Resend, et aucune reprise ne rendra lisible un événement illisible.
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
    if (!(await this.journal.rememberEvent(PROVIDER, externalId))) {
      // Svix réessaie : le traiter deux fois compterait deux rebonds pour un.
      return;
    }
    const event = readResendEvent(parse(body));
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
}

/** Un JSON illisible n'est pas une panne : c'est un message qu'on ignore. */
function parse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
