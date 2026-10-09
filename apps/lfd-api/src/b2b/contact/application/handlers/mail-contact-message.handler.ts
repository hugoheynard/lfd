import { isValidReplyTo } from "@lfd/mailer";
import { Inject, Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { ContactMessageReceivedEvent } from "../../domain/contact-message.events.js";

/** Comment le courriel dit d'où le message a été écrit. */
const ORIGIN_LABELS = { b2b: "Espace pro", b2c: "Particulier" } as const;

/**
 * Envoie un message « Nous écrire » à l'adresse de son objet, **`Reply-To` =
 * l'auteur** : répondre au courriel lui écrit directement (`nous-contacter.md`,
 * §2.2 et §5.1) — sauf si l'adresse ne passe pas `isValidReplyTo` : le
 * courriel part alors sans, plutôt que pas du tout.
 *
 * Hors de la requête, suivi par `BackgroundWork`. Un échec d'envoi est écrit
 * dans les logs — avec l'id du message, jamais l'adresse — et le message reste
 * rangé au back-office : c'est là qu'on le retrouve.
 */
@EventsHandler(ContactMessageReceivedEvent)
export class MailContactMessage implements IEventHandler<ContactMessageReceivedEvent> {
  private readonly logger = new Logger(MailContactMessage.name);

  constructor(
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: ContactMessageReceivedEvent): void {
    void this.work.track(this.run(event), "mail-contact-message");
  }

  private async run(event: ContactMessageReceivedEvent): Promise<void> {
    const message = event.message.toPersistence();
    // Une adresse que le mailer refuserait en en-tête ne fait pas perdre le
    // courriel : il part sans Reply-To, l'adresse reste lisible dans le corps.
    const replyable = isValidReplyTo(message.author.email);
    if (!replyable) {
      this.logger.warn(
        `Courriel « Nous écrire » sans Reply-To (${message.id}) : adresse refusée en en-tête.`,
      );
    }
    try {
      await this.mailer.send({
        to: event.recipientEmail,
        ...(replyable ? { replyTo: message.author.email } : {}),
        template: "staff.contact-message",
        idempotencyKey: `contact-message:${message.id}`,
        data: {
          subjectLabel: message.subjectLabel,
          urgent: message.priority === "urgent",
          authorName: message.author.name,
          authorEmail: message.author.email,
          authorPhone: message.author.phone,
          originLabel: ORIGIN_LABELS[message.audience],
          clientLabel: clientLabelOf(message.companyId, message.userId),
          message: message.body,
        },
      });
    } catch (error) {
      this.logger.error(
        `Courriel « Nous écrire » non envoyé (${message.id}) : le message reste rangé au back-office.`,
        error,
      );
    }
  }
}

/** Les identifiants d'un client connecté, pour le retrouver au back-office. Vide pour un visiteur. */
function clientLabelOf(companyId: string | null, userId: string | null): string {
  if (companyId !== null) {
    return `société ${companyId}`;
  }
  return userId === null ? "" : `compte ${userId}`;
}
