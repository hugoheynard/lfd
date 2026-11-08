import { Inject, Logger, Optional } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../platform/config/app-config.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import {
  InboundMailSink,
  type InboundMailNotice,
} from "../../../platform/mailer/inbound/inbound-mail.sink.js";
import { InboundSinkMissingError } from "../../../platform/mailer/inbound/inbound-sink-missing.error.js";
import { MailJournal } from "../../../platform/mailer/journal/mail-journal.port.js";
import { verifySvixSignature } from "../../../platform/mailer/webhook/svix-signature.js";
import { Clock } from "../../../platform/time/clock.js";
import { MailDeliveryApplier } from "../../requests/application/mail-delivery-applier.js";
import { MailDeliveryEvent } from "../domain/entities/mail-delivery-event.js";
import { MailDeliveryEventLog } from "../domain/ports/mail-delivery-event.log.js";
import {
  ReceiveResendEventCommand,
  type ResendEventReceipt,
} from "./receive-resend-event.command.js";
import { readReceivedEmail, readResendEvent, type ResendEvent } from "./resend-event.js";

/**
 * Prouve l'origine d'un webhook Resend, **range** le retour, puis l'applique
 * aux demandes connues (plan `documentation/mail/plan-suivi-des-e-mails.md`,
 * décision 2, lot T1).
 *
 * Ranger d'abord, parce qu'un rebond rapide peut arriver avant que l'envoi
 * n'ait écrit son `provider_id` : il attend alors dans
 * `mail.mail_delivery_event`, et la demande le relit en recevant son
 * identifiant (`MailOutcomeRecorder`), ou le balayeur l'applique. Le
 * `svix-id` unique de cette table dédoublonne un rejeu. `ops.mail_send` reste
 * écrite pendant la transition (décision 5) — avec le genre, jamais le texte.
 *
 * On ne rejette **jamais** au-delà du refus de signature : un `5xx` ferait
 * réessayer Resend, et aucune reprise ne rendra lisible un événement
 * illisible. Une application qui échoue après un rangement réussi est
 * journalisée et laissée au balayeur.
 *
 * 🔴 **Sauf un e-mail REÇU** (`email.received`, plan
 * `plan-reponses-par-e-mail.md`, §3) : il est remis au port
 * `InboundMailSink` de `platform/` sans rien consommer. L'échec remonte
 * (Resend rejoue), et l'idempotence est celle du rangement.
 *
 * @sans-journal le suivi des e-mails EST la trace : c'est lui qu'on écrit.
 */
@CommandHandler(ReceiveResendEventCommand)
export class ReceiveResendEventHandler implements ICommandHandler<
  ReceiveResendEventCommand,
  ResendEventReceipt
> {
  private readonly logger = new Logger(ReceiveResendEventHandler.name);

  constructor(
    @Inject(AppConfig) private readonly config: Pick<AppConfig, "mailerConfig">,
    private readonly events: MailDeliveryEventLog,
    private readonly deliveries: MailDeliveryApplier,
    private readonly journal: MailJournal,
    private readonly ids: IdGenerator,
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

  private async consume(svixId: string, body: string): Promise<void> {
    const payload = parse(body);
    const received = readReceivedEmail(payload);
    if (received !== null) {
      await this.deliver(received);
      return;
    }
    const event = readResendEvent(payload);
    if (event === null) {
      return;
    }
    const stored = this.toStored(svixId, event);
    if (!(await this.events.addIfAbsent(stored))) {
      // Svix réessaie : appliqué deux fois, un rebond compterait double.
      return;
    }
    await this.journal.recordOutcome({
      providerId: event.providerId,
      status: event.delivery,
      at: stored.report().at,
      detail: event.kind ?? "",
    });
    await this.applyNow(stored);
  }

  private toStored(svixId: string, event: ResendEvent): MailDeliveryEvent {
    const now = this.clock.now();
    return MailDeliveryEvent.receive({
      id: this.ids.next(),
      svixId,
      providerId: event.providerId,
      delivery: event.delivery,
      kind: event.kind,
      occurredAt: event.occurredAt ?? now,
      receivedAt: now,
    });
  }

  /** Rangé : un échec d'application n'en perd rien, le balayeur repassera. */
  private async applyNow(event: MailDeliveryEvent): Promise<void> {
    try {
      await this.deliveries.apply(event.providerId, event.report());
    } catch (error) {
      this.logger.error(
        `Retour Resend rangé mais non appliqué (${event.providerId}) : le balayeur l'appliquera.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
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
