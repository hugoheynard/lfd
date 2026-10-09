import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ContactSubjectNotFoundError } from "../../domain/errors/contact-errors.js";
import { ContactSubjectRepository } from "../../domain/ports/contact-subject.repository.js";
import { ArchiveContactSubjectCommand } from "./archive-contact-subject.command.js";

/**
 * Archive un objet de contact — jamais de suppression : un message reçu garde
 * la référence de son objet. Idempotent.
 *
 * @sans-journal un réglage d'écran sans règle de refus métier (plan §5.7).
 */
@CommandHandler(ArchiveContactSubjectCommand)
export class ArchiveContactSubjectHandler implements ICommandHandler<
  ArchiveContactSubjectCommand,
  void
> {
  constructor(
    private readonly subjects: ContactSubjectRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchiveContactSubjectCommand): Promise<void> {
    const subject = await this.subjects.load(command.subjectId);
    if (subject === null) {
      throw new ContactSubjectNotFoundError(command.subjectId);
    }
    subject.archive(this.clock.now());
    await this.subjects.save(subject);
  }
}
