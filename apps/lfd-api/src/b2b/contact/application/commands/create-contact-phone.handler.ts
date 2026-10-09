import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ContactPhone } from "../../domain/contact-phone.js";
import { ContactPhoneRepository } from "../../domain/ports/contact-phone.repository.js";
import { CreateContactPhoneCommand } from "./create-contact-phone.command.js";

/**
 * Crée un numéro de contact ; le numéro refuse lui-même un libellé ou un
 * numéro invalide.
 *
 * @sans-journal un réglage d'écran sans règle de refus métier, comme les objets.
 */
@CommandHandler(CreateContactPhoneCommand)
export class CreateContactPhoneHandler implements ICommandHandler<
  CreateContactPhoneCommand,
  string
> {
  constructor(
    private readonly phones: ContactPhoneRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateContactPhoneCommand): Promise<string> {
    const phone = ContactPhone.create({
      ...command.payload,
      id: this.ids.next(),
      at: this.clock.now(),
    });
    await this.phones.save(phone);
    return phone.id;
  }
}
