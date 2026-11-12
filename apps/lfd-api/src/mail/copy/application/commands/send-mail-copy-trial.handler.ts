import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { StaffContacts } from "../../../../staff/directory/domain/staff-contacts.js";
import { MailCopyAdminReader } from "../../domain/ports/mail-copy-admin.reader.js";
import { MailTrialSender } from "../../domain/ports/mail-specimen.renderer.js";
import { TrialRecipientMissingError, UnknownMailError } from "../../domain/mail-copy-errors.js";
import { MailCopyManifest } from "../../domain/mail-copy-manifest.js";
import { replacementTexts } from "../../domain/mail-copy-texts.js";
import { replacementSectionOrders } from "../../domain/mail-section-orders.js";
import { MailCopyTrialSentEvent } from "../../domain/mail-copy.events.js";
import { SendMailCopyTrialCommand } from "./send-mail-copy-trial.command.js";

/**
 * Envoie l'aperçu d'un e-mail — son vrai gabarit, ses données d'exemple, les
 * textes et l'ordre des sections de la source demandée — à l'adresse de la
 * fiche de la personne connectée, et à elle seule (C6). L'adresse ne vient JAMAIS de la requête :
 * un essai ne peut pas devenir un envoi à un tiers.
 *
 * L'envoi part avant le fait : un e-mail parti est parti, et un fait écrit
 * pour un essai qui n'est pas parti mentirait. Si le journal échoue ensuite,
 * l'erreur remonte — l'essai est arrivé, sa trace manque, et la personne le
 * voit.
 *
 * **Une fois par intention** (plan `plan-service-e-mails.md`, revue, cas 4) :
 * un double clic sur « M'envoyer un essai » n'en envoie qu'un.
 */
@CommandHandler(SendMailCopyTrialCommand)
export class SendMailCopyTrialHandler implements ICommandHandler<SendMailCopyTrialCommand, void> {
  constructor(
    private readonly reader: MailCopyAdminReader,
    private readonly manifest: MailCopyManifest,
    private readonly contacts: StaffContacts,
    private readonly sender: MailTrialSender,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * @throws {UnknownMailError} l'e-mail n'est pas au registre.
   * @throws {TrialRecipientMissingError} la fiche n'a pas d'adresse active.
   */
  execute(command: SendMailCopyTrialCommand): Promise<void> {
    // Scellée avec le fait de l'essai ; l'envoi, réseau et idempotent par la
    // clé, part avant la transaction.
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "mail.trial",
        subject: intentSubject(command.mail, command.locale, command.source, command.editor),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.trial(command, seal),
    );
  }

  private async trial(
    command: SendMailCopyTrialCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    if (!this.manifest.hasMail(command.mail)) {
      throw new UnknownMailError(command.mail);
    }
    const to = await this.recipientOf(command.staffUserId);
    const [states, orders] = await Promise.all([
      this.reader.entries(),
      this.reader.sectionOrders(),
    ]);
    const texts = replacementTexts(states, this.manifest, command.locale, command.source);
    const order =
      replacementSectionOrders(orders, this.manifest, command.source)[command.mail] ?? null;
    await this.sender.send(
      to,
      command.mail,
      command.locale,
      texts,
      order,
      command.intentKey,
      command.editor,
    );
    await this.uow.run(async () => {
      await this.events.publishTraced(
        new MailCopyTrialSentEvent(command.mail, command.locale, command.source),
      );
      await seal(undefined);
    });
  }

  private async recipientOf(staffUserId: string): Promise<string> {
    const contact = (await this.contacts.contactsOf([staffUserId])).get(staffUserId);
    if (contact === undefined || !contact.active || contact.email.trim() === "") {
      throw new TrialRecipientMissingError();
    }
    return contact.email;
  }
}
