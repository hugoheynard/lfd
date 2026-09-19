import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DeliveryZoneUpdatedEvent } from "../domain/delivery-zone.events.js";
import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";
import { UpdateDeliveryZoneCommand } from "./update-delivery-zone.command.js";

/** Handler **staff** : modifie une zone de livraison. Mince : délègue au repository. */
@CommandHandler(UpdateDeliveryZoneCommand)
export class UpdateDeliveryZoneHandler implements ICommandHandler<UpdateDeliveryZoneCommand, void> {
  constructor(
    private readonly zones: DeliveryZoneRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateDeliveryZoneCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.zones.update(command.id, command.payload);
      await this.events.publishTraced(new DeliveryZoneUpdatedEvent(command.id, command.payload));
    });
  }
}
