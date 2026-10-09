import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ContactPhoneNotFoundError } from "../../domain/errors/contact-errors.js";
import { ContactPhoneRepository } from "../../domain/ports/contact-phone.repository.js";
import { ReviseContactPhoneCommand } from "./revise-contact-phone.command.js";

/**
 * Révise un numéro de contact.
 *
 * @sans-journal un réglage d'écran sans règle de refus métier, comme les objets.
 */
@CommandHandler(ReviseContactPhoneCommand)
export class ReviseContactPhoneHandler implements ICommandHandler<ReviseContactPhoneCommand, void> {
  constructor(
    private readonly phones: ContactPhoneRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ReviseContactPhoneCommand): Promise<void> {
    const phone = await this.phones.load(command.phoneId);
    if (phone === null) {
      throw new ContactPhoneNotFoundError(command.phoneId);
    }
    phone.revise(command.payload, this.clock.now());
    await this.phones.save(phone);
  }
}
