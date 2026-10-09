import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ContactMessage } from "../../domain/contact-message.js";
import { ContactMessageReceivedEvent } from "../../domain/contact-message.events.js";
import { looksAutomated } from "../../domain/contact-trap.js";
import {
  ContactSubjectNotFoundError,
  ContactSubjectUnavailableError,
} from "../../domain/errors/contact-errors.js";
import { ContactMessageRepository } from "../../domain/ports/contact-message.repository.js";
import { ContactSubjectRepository } from "../../domain/ports/contact-subject.repository.js";
import { SendContactMessageCommand } from "./send-contact-message.command.js";

/**
 * Reçoit un message « Nous écrire » (`plan-nous-ecrire.md`, §2.2).
 *
 * L'ordre compte : le piège d'abord (un robot n'apprend rien de l'objet qu'il
 * a choisi), puis l'objet — actif et proposé à ce public, vérifié ici et non à
 * l'écran —, puis le message, que l'agrégat refuse incomplet. Il est RANGÉ
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
  ) {}

  async execute(command: SendContactMessageCommand): Promise<void> {
    const { payload, sender } = command;
    if (looksAutomated(payload)) {
      // Aucune donnée saisie dans le journal : le compte suffit à voir une vague.
      this.logger.warn("Message « Nous écrire » écarté : piège rempli ou saisie trop rapide.");
      return;
    }
    const subject = await this.subjects.load(payload.subjectId);
    if (subject === null) {
      throw new ContactSubjectNotFoundError(payload.subjectId);
    }
    if (!subject.isOfferedTo(payload.audience)) {
      throw new ContactSubjectUnavailableError(payload.subjectId);
    }
    const message = ContactMessage.receive({
      id: this.ids.next(),
      subject: { id: subject.id, labelFr: subject.labelFr, priority: subject.priority },
      audience: payload.audience,
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
