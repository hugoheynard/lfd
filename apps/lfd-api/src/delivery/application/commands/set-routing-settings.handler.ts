import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { RoutingSettingsUpdatedEvent } from "../../domain/events/delivery-routing.events.js";
import { RoutingSettingsReader } from "../../domain/ports/routing-settings.reader.js";
import { RoutingSettingsRepository } from "../../domain/ports/routing-settings.repository.js";
import { RoutingSettings } from "../../domain/value-objects/routing-settings.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { SetRoutingSettingsCommand } from "./set-routing-settings.command.js";

/**
 * Pose les réglages du calcul de tournée (L7-C13, L7-C15). Le value object
 * refuse une valeur hors bornes ; le fait dit l'avant et l'après.
 *
 * @throws {InvalidRoutingSettingError}
 */
@CommandHandler(SetRoutingSettingsCommand)
export class SetRoutingSettingsHandler implements ICommandHandler<SetRoutingSettingsCommand, void> {
  constructor(
    private readonly reader: RoutingSettingsReader,
    private readonly settings: RoutingSettingsRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetRoutingSettingsCommand): Promise<void> {
    const next = RoutingSettings.define(command.payload);
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const before = await this.reader.current();
      await this.settings.put(next, this.clock.now(), author);
      await this.events.publishTraced(
        new RoutingSettingsUpdatedEvent(next, before === null ? null : before.values()),
      );
    });
  }
}
