import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../../feature-access/application/feature-access-author.js";
import { DeliverySettings } from "../../domain/delivery-settings.js";
import { DeliverySettingsUpdatedEvent } from "../../domain/delivery-settings.events.js";
import { DeliverySettingsReader } from "../../domain/ports/delivery-settings.reader.js";
import { DeliverySettingsRepository } from "../../domain/ports/delivery-settings.repository.js";
import { UpdateDeliverySettingsCommand } from "./update-delivery-settings.command.js";

/**
 * Pose le réglage de livraison. L'état remplacé est relu DANS la transaction :
 * un patch ne dit qu'une case, et l'autre doit être celle qui est écrite, pas
 * celle qu'un écran a vue. L'écriture et sa trace partent ensemble.
 */
@CommandHandler(UpdateDeliverySettingsCommand)
export class UpdateDeliverySettingsHandler implements ICommandHandler<
  UpdateDeliverySettingsCommand,
  void
> {
  constructor(
    private readonly reader: DeliverySettingsReader,
    private readonly settings: DeliverySettingsRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateDeliverySettingsCommand): Promise<void> {
    const author = await authorOf(this.staff, command.staffSub);
    await this.uow.run(async () => {
      const previous = await this.reader.current();
      const next = DeliverySettings.pose({
        current: previous,
        patch: command.patch,
        at: this.clock.now(),
        author,
      });
      await this.settings.put(next);
      await this.events.publishTraced(new DeliverySettingsUpdatedEvent(next, previous));
    });
  }
}
