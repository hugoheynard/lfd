import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../../feature-access/application/feature-access-author.js";
import { DeliveryAvailability } from "../../domain/delivery-availability.js";
import { DeliveryAvailabilityUpdatedEvent } from "../../domain/delivery-availability.events.js";
import { DeliveryAvailabilityReader } from "../../domain/ports/delivery-availability.reader.js";
import { DeliveryAvailabilityRepository } from "../../domain/ports/delivery-availability.repository.js";
import { UpdateDeliveryAvailabilityCommand } from "./update-delivery-availability.command.js";

/**
 * Pose le réglage de livraison. L'état remplacé est relu DANS la transaction :
 * un patch ne dit qu'une case, et l'autre doit être celle qui est écrite, pas
 * celle qu'un écran a vue. L'écriture et sa trace partent ensemble.
 */
@CommandHandler(UpdateDeliveryAvailabilityCommand)
export class UpdateDeliveryAvailabilityHandler implements ICommandHandler<
  UpdateDeliveryAvailabilityCommand,
  void
> {
  constructor(
    private readonly reader: DeliveryAvailabilityReader,
    private readonly settings: DeliveryAvailabilityRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateDeliveryAvailabilityCommand): Promise<void> {
    const author = await authorOf(this.staff, command.staffUserId);
    await this.uow.run(async () => {
      const previous = await this.reader.current();
      const next = DeliveryAvailability.pose({
        current: previous,
        patch: command.patch,
        at: this.clock.now(),
        author,
      });
      await this.settings.put(next);
      await this.events.publishTraced(new DeliveryAvailabilityUpdatedEvent(next, previous));
    });
  }
}
