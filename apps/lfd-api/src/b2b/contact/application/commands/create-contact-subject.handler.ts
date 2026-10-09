import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ContactSubject } from "../../domain/contact-subject.js";
import { ContactSubjectRepository } from "../../domain/ports/contact-subject.repository.js";
import { CreateContactSubjectCommand } from "./create-contact-subject.command.js";

/**
 * Crée un objet de contact. L'objet refuse lui-même un libellé français vide
 * ou une adresse invalide.
 *
 * @sans-journal un réglage d'écran sans règle de refus métier (plan §5.7 :
 * « CRUD honnête ») ; seul le traitement d'un message est un fait journalisé.
 */
@CommandHandler(CreateContactSubjectCommand)
export class CreateContactSubjectHandler implements ICommandHandler<
  CreateContactSubjectCommand,
  string
> {
  constructor(
    private readonly subjects: ContactSubjectRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateContactSubjectCommand): Promise<string> {
    const subject = ContactSubject.create({
      ...command.payload,
      id: this.ids.next(),
      at: this.clock.now(),
    });
    await this.subjects.save(subject);
    return subject.id;
  }
}
