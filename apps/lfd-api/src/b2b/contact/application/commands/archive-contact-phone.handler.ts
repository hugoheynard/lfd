import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ContactPhoneNotFoundError } from "../../domain/errors/contact-errors.js";
import { ContactPhoneRepository } from "../../domain/ports/contact-phone.repository.js";
import { ArchiveContactPhoneCommand } from "./archive-contact-phone.command.js";

/**
 * Archive un numéro de contact — jamais de suppression. Idempotent.
 *
 * @sans-journal un réglage d'écran sans règle de refus métier, comme les objets.
 */
@CommandHandler(ArchiveContactPhoneCommand)
export class ArchiveContactPhoneHandler implements ICommandHandler<
  ArchiveContactPhoneCommand,
  void
> {
  constructor(
    private readonly phones: ContactPhoneRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchiveContactPhoneCommand): Promise<void> {
    const phone = await this.phones.load(command.phoneId);
    if (phone === null) {
      throw new ContactPhoneNotFoundError(command.phoneId);
    }
    phone.archive(this.clock.now());
    await this.phones.save(phone);
  }
}
