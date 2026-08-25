import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import {
  DeliveryZoneCreatedEvent,
  DeliveryZoneRemovedEvent,
  DeliveryZoneUpdatedEvent,
} from "../domain/delivery-zone.events.js";
import { DeliveryZoneRepository } from "../domain/delivery-zone.repository.js";
import {
  CreateDeliveryZoneCommand,
  RemoveDeliveryZoneCommand,
  UpdateDeliveryZoneCommand,
} from "./delivery-zone.commands.js";

/** Handlers **staff** des zones de livraison. Minces : délèguent au repository. */

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

@CommandHandler(RemoveDeliveryZoneCommand)
export class RemoveDeliveryZoneHandler implements ICommandHandler<RemoveDeliveryZoneCommand, void> {
  constructor(
    private readonly zones: DeliveryZoneRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveDeliveryZoneCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.zones.remove(command.id);
      await this.events.publishTraced(new DeliveryZoneRemovedEvent(command.id));
    });
  }
}
