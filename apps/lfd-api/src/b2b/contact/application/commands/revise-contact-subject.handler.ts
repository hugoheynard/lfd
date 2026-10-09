import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ContactSubjectNotFoundError } from "../../domain/errors/contact-errors.js";
import { ContactSubjectRepository } from "../../domain/ports/contact-subject.repository.js";
import { ReviseContactSubjectCommand } from "./revise-contact-subject.command.js";

/**
 * Révise un objet de contact. Les messages déjà reçus gardent le libellé figé
 * à leur réception.
 *
 * @sans-journal un réglage d'écran sans règle de refus métier (plan §5.7).
 */
@CommandHandler(ReviseContactSubjectCommand)
export class ReviseContactSubjectHandler implements ICommandHandler<
  ReviseContactSubjectCommand,
  void
> {
  constructor(
    private readonly subjects: ContactSubjectRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ReviseContactSubjectCommand): Promise<void> {
    const subject = await this.subjects.load(command.subjectId);
    if (subject === null) {
      throw new ContactSubjectNotFoundError(command.subjectId);
    }
    subject.revise(command.payload, this.clock.now());
    await this.subjects.save(subject);
  }
}
