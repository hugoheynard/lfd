import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ContactMessage } from "../../domain/contact-message.js";
import { ContactMessageReceivedEvent } from "../../domain/contact-message.events.js";
import { trapIsFilled } from "../../domain/contact-trap.js";
import {
  ContactSubjectNotFoundError,
  ContactSubjectUnavailableError,
} from "../../domain/errors/contact-errors.js";
import { ContactSenderAudience } from "../../domain/ports/contact-sender-audience.js";
import { ContactMessageRepository } from "../../domain/ports/contact-message.repository.js";
import { ContactSubjectRepository } from "../../domain/ports/contact-subject.repository.js";
import { SendContactMessageCommand } from "./send-contact-message.command.js";

/**
 * Reçoit un message « Nous écrire » (`nous-contacter.md`, §2.2).
 *
 * L'ordre compte : le piège d'abord (un robot n'apprend rien de l'objet qu'il
 * a choisi), puis l'objet — actif et proposé au public DÉDUIT de qui écrit
 * (visiteur → `b2c`), vérifié ici et non à l'écran —, puis le message, que l'agrégat refuse incomplet. Il est RANGÉ
 * avant toute chose ; le courriel et la cloche partent ensuite, par ses
 * abonnés, et leur échec ne le défait pas.
 *
 * @sans-journal ce n'est pas un acte du staff, et la charge porterait des
 * données personnelles qui s'anonymisent à douze mois ; le traitement, lui,
 * est journalisé.
 */
@CommandHandler(SendContactMessageCommand)
export class SendContactMessageHandler implements ICommandHandler<SendContactMessageCommand, void> {
  private readonly logger = new Logger(SendContactMessageHandler.name);

  constructor(
    private readonly subjects: ContactSubjectRepository,
    private readonly messages: ContactMessageRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly audiences: ContactSenderAudience,
  ) {}

  async execute(command: SendContactMessageCommand): Promise<void> {
    const { payload, sender } = command;
    if (trapIsFilled(payload.lfd_trap)) {
      // De quoi reconnaître une vague (objet, taille, IP tronquée) — jamais
      // l'e-mail ni le texte saisis.
      this.logger.warn(
        `Message « Nous écrire » écarté par le piège : objet ${payload.subjectId}, ` +
          `${String(payload.message.length)} caractères, IP ${command.clientIp}.`,
      );
      return;
    }
    const audience = sender === null ? "b2c" : await this.audiences.of(sender.companyId);
    const subject = await this.subjects.load(payload.subjectId);
    if (subject === null) {
      throw new ContactSubjectNotFoundError(payload.subjectId);
    }
    if (!subject.isOfferedTo(audience)) {
      throw new ContactSubjectUnavailableError(payload.subjectId);
    }
    const message = ContactMessage.receive({
      id: this.ids.next(),
      subject: { id: subject.id, labelFr: subject.labelFr, priority: subject.priority },
      audience,
      author: { name: payload.name, email: payload.email, phone: payload.phone },
      body: payload.message,
      userId: sender?.userId ?? null,
      companyId: sender?.companyId ?? null,
      at: this.clock.now(),
    });
    await this.messages.save(message);
    this.events.publish(new ContactMessageReceivedEvent(message, subject.recipientEmail));
  }
}
