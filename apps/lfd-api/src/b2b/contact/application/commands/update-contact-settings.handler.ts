import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../../feature-access/application/feature-access-author.js";
import { ContactSettings } from "../../domain/contact-settings.js";
import { ContactSettingsRepository } from "../../domain/ports/contact-settings.repository.js";
import { UpdateContactSettingsCommand } from "./update-contact-settings.command.js";

/**
 * Pose la carte de contact — le réglage entier, d'un bloc.
 *
 * @sans-journal un réglage de textes sans règle de refus métier ; la ligne
 * porte son instant et son auteur, comme `order_opening_settings`.
 */
@CommandHandler(UpdateContactSettingsCommand)
export class UpdateContactSettingsHandler implements ICommandHandler<
  UpdateContactSettingsCommand,
  void
> {
  constructor(
    private readonly settings: ContactSettingsRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: UpdateContactSettingsCommand): Promise<void> {
    const author = await authorOf(this.staff, command.staffUserId);
    await this.settings.put(
      ContactSettings.pose({ settings: command.payload, at: this.clock.now(), author }),
    );
  }
}
