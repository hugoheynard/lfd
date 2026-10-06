import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { DoorstepSettingsUpdatedEvent } from "../../domain/events/doorstep-settings.events.js";
import { DoorstepSettingsReader } from "../../domain/ports/doorstep-settings.reader.js";
import { DoorstepSettingsRepository } from "../../domain/ports/doorstep-settings.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { SetDoorstepSettingsCommand } from "./set-doorstep-settings.command.js";

/**
 * Pose la décision réglée d'avance à la porte, pour toutes les adresses qui
 * ne la redéfinissent pas (`a-la-porte.md`, B3 bis, LB-Q6). Le fait dit
 * l'avant et l'après ; une règle déjà en vigueur n'écrit rien. Une tournée
 * déjà partie garde la règle qu'elle a figée.
 */
@CommandHandler(SetDoorstepSettingsCommand)
export class SetDoorstepSettingsHandler implements ICommandHandler<
  SetDoorstepSettingsCommand,
  void
> {
  constructor(
    private readonly reader: DoorstepSettingsReader,
    private readonly settings: DoorstepSettingsRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetDoorstepSettingsCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const before = await this.reader.current();
      if (before === command.rule) {
        return;
      }
      await this.settings.put(command.rule, this.clock.now(), author);
      await this.events.publishTraced(new DoorstepSettingsUpdatedEvent(command.rule, before));
    });
  }
}
