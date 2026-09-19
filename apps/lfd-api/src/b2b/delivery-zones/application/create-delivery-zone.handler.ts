import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DeliveryZoneCreatedEvent } from "../domain/delivery-zone.events.js";
import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";
import { CreateDeliveryZoneCommand } from "./create-delivery-zone.command.js";

/** Handler **staff** : crée une zone de livraison. Mince : délègue au repository. */
@CommandHandler(CreateDeliveryZoneCommand)
export class CreateDeliveryZoneHandler implements ICommandHandler<
  CreateDeliveryZoneCommand,
  string
> {
  constructor(
    private readonly zones: DeliveryZoneRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateDeliveryZoneCommand): Promise<string> {
    return await this.uow.run(async () => {
      const zoneId = await this.zones.create(command.payload);
      await this.events.publishTraced(new DeliveryZoneCreatedEvent(zoneId, command.payload));
      return zoneId;
    });
  }
}
