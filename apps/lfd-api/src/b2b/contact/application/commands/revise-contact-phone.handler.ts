import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import type { ContactPhone } from "../../domain/contact-phone.js";
import { ContactPhoneNotFoundError } from "../../domain/errors/contact-errors.js";
import { assertCardsReachable } from "../../domain/contact-reach.js";
import { ContactPhoneReader } from "../../domain/ports/contact-phone.reader.js";
import { ContactSettingsReader } from "../../domain/ports/contact-settings.reader.js";
import { ContactPhoneRepository } from "../../domain/ports/contact-phone.repository.js";
import { ReviseContactPhoneCommand } from "./revise-contact-phone.command.js";

/**
 * Révise un numéro de contact.
 *
 * @sans-journal un réglage d'écran ; sa seule règle de refus (une carte qui
 * n'offrirait plus aucun geste, 2026-10-26) ne laisse rien à journaliser.
 */
@CommandHandler(ReviseContactPhoneCommand)
export class ReviseContactPhoneHandler implements ICommandHandler<ReviseContactPhoneCommand, void> {
  constructor(
    private readonly phones: ContactPhoneRepository,
    private readonly phoneList: ContactPhoneReader,
    private readonly settings: ContactSettingsReader,
    private readonly clock: Clock,
  ) {}

  async execute(command: ReviseContactPhoneCommand): Promise<void> {
    const phone = await this.phones.load(command.phoneId);
    if (phone === null) {
      throw new ContactPhoneNotFoundError(command.phoneId);
    }
    phone.revise(command.payload, this.clock.now());
    await this.assertStillReachable(phone);
    await this.phones.save(phone);
  }

  /** Les numéros tels qu'ils seront après ce geste : chaque carte doit garder un geste. */
  private async assertStillReachable(phone: ContactPhone): Promise<void> {
    const after = phone.toPersistence();
    const [others, settings] = await Promise.all([this.phoneList.list(), this.settings.current()]);
    const phones = others.filter((other) => other.id !== after.id);
    assertCardsReachable(settings.cards, after.archivedAt === null ? [...phones, after] : phones);
  }
}
