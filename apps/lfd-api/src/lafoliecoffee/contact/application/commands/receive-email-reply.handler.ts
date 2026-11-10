import { EMAIL_REPLY_BOUNDS } from "@lfd/contracts";
import type { ReceivedMail } from "@lfd/mailer";
import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { InboundMailReader } from "../../../../platform/mailer/inbound/inbound-mail.reader.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CustomerRequest } from "../../domain/customer-request.js";
import type { ReportedOrderRef } from "../../domain/customer-request-details.js";
import { EMAIL_REPLY_REASON_ID } from "../../domain/email-reply.js";
import { CustomerEmailReplyReceived } from "../../domain/email-reply.events.js";
import { SystemReasonMissingError } from "../../domain/errors/email-reply-errors.js";
import {
  authenticationOf,
  isAutomaticReply,
  orderNumberIn,
  readSender,
  type MessageSender,
} from "../../domain/inbound-message.js";
import { ContactSenderAudience } from "../../domain/ports/contact-sender-audience.js";
import { CustomerRequestRepository } from "../../domain/ports/customer-request.repository.js";
import { EmailSenderAccountReader } from "../../domain/ports/email-sender-account.reader.js";
import { PresumedOrderReader } from "../../domain/ports/presumed-order.reader.js";
import { RecentEmailRepliesReader } from "../../domain/ports/recent-email-replies.reader.js";
import { RequestReasonRepository } from "../../domain/ports/request-reason.repository.js";
import { ReceiveEmailReplyCommand } from "./receive-email-reply.command.js";

/** L'heure glissante du plafond de réception et de la cloche. */
const HOUR_MS = 60 * 60 * 1000;

/** Ce que le compte et la commande présumés donnent à la demande. */
interface PresumedLinks {
  readonly userId: string | null;
  readonly companyId: string | null;
  readonly order: ReportedOrderRef | null;
}

/**
 * **Range une réponse d'un client à un de nos e-mails** — une demande
 * `email_reply` (plan `documentation/demandes-client/plan-reponses-par-e-mail.md`,
 * §2 et §3).
 *
 * L'ordre : relire le message chez Resend (un échec remonte, Resend rejoue) ;
 * écarter une adresse illisible, une réponse automatique, et ce qui dépasse
 * dix messages dans l'heure pour une même adresse — journalisés sans donnée
 * personnelle, seulement l'identifiant Resend ; présumer le compte et la
 * commande ; ranger par insérer-ou-ignorer sur l'identifiant du message (un
 * rejeu ne range rien) ; enfin publier `CustomerEmailReplyReceived`, pour la
 * cloche — jamais un courriel.
 *
 * @sans-journal ce n'est pas un acte du staff, et la charge porterait des
 * données personnelles qui s'anonymisent à douze mois ; le traitement, lui,
 * est journalisé.
 */
@CommandHandler(ReceiveEmailReplyCommand)
export class ReceiveEmailReplyHandler implements ICommandHandler<ReceiveEmailReplyCommand, void> {
  private readonly logger = new Logger(ReceiveEmailReplyHandler.name);

  constructor(
    private readonly mails: InboundMailReader,
    private readonly reasons: RequestReasonRepository,
    private readonly requests: CustomerRequestRepository,
    private readonly recent: RecentEmailRepliesReader,
    private readonly accounts: EmailSenderAccountReader,
    private readonly orders: PresumedOrderReader,
    private readonly audiences: ContactSenderAudience,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: ReceiveEmailReplyCommand): Promise<void> {
    const mail = await this.mails.read(command.emailId);
    const sender = readSender(mail.from);
    if (sender === null) {
      this.logger.warn(`Réponse par e-mail ${mail.id} écartée : adresse d'expédition illisible.`);
      return;
    }
    if (isAutomaticReply(mail.headers)) {
      this.logger.log(`Réponse par e-mail ${mail.id} écartée : réponse automatique.`);
      return;
    }
    const now = this.clock.now();
    const earlier = await this.recent.countFromSince(
      sender.email,
      new Date(now.getTime() - HOUR_MS),
    );
    if (earlier >= EMAIL_REPLY_BOUNDS.maxPerSenderPerHour) {
      this.logger.warn(
        `Réponse par e-mail ${mail.id} écartée : plus de ${String(EMAIL_REPLY_BOUNDS.maxPerSenderPerHour)} messages dans l'heure pour cette adresse.`,
      );
      return;
    }
    const request = await this.compose(mail, sender, now);
    if (await this.requests.receiveOnce(request)) {
      this.events.publish(new CustomerEmailReplyReceived(request, earlier));
    }
  }

  private async compose(
    mail: ReceivedMail,
    sender: MessageSender,
    at: Date,
  ): Promise<CustomerRequest> {
    const reason = await this.reasons.load(EMAIL_REPLY_REASON_ID);
    if (reason === null) {
      throw new SystemReasonMissingError(EMAIL_REPLY_REASON_ID);
    }
    const links = await this.presume(sender.email, mail.subject);
    return CustomerRequest.emailReply({
      id: this.ids.next(),
      reason: { id: reason.id, labelFr: reason.labelFr, priority: reason.priority },
      audience: await this.audiences.of(links.companyId),
      sender,
      text: mail.text,
      html: mail.html,
      userId: links.userId,
      companyId: links.companyId,
      at,
      messageId: mail.id,
      subject: mail.subject,
      attachments: mail.attachments,
      authentication: authenticationOf(mail.headers, sender.email),
      order: links.order,
    });
  }

  /**
   * Le compte que désigne l'adresse (inconnue ou ambiguë : personne), et la
   * commande que l'objet cite, si ce compte la voit. Tout est PRÉSUMÉ.
   */
  private async presume(email: string, subject: string): Promise<PresumedLinks> {
    const account = await this.accounts.presumedOf(email);
    if (account === null) {
      return { userId: null, companyId: null, order: null };
    }
    const number = orderNumberIn(subject);
    const order =
      number === null ? null : await this.orders.visibleByNumber(number, account.userId);
    return {
      userId: account.userId,
      companyId: order?.companyId ?? null,
      order: order === null ? null : { id: order.id, number: order.number },
    };
  }
}
