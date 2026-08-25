import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import {
  DefaultPickupAddressSetEvent,
  PickupAddressCreatedEvent,
  PickupAddressRemovedEvent,
  PickupAddressUpdatedEvent,
} from "../domain/pickup-address.events.js";
import { PickupAddressRepository } from "../domain/pickup-address.repository.js";
import {
  CreatePickupAddressCommand,
  RemovePickupAddressCommand,
  SetDefaultPickupAddressCommand,
  UpdatePickupAddressCommand,
} from "./pickup-address.commands.js";

/**
 * Handlers **staff** des points de retrait. Minces : ils délèguent au repository,
 * qui tient les invariants (un seul défaut, au moins un point). Le mur est
 * l'`AdminAuthGuard` sur la route.
 */

@CommandHandler(CreatePickupAddressCommand)
export class CreatePickupAddressHandler implements ICommandHandler<
  CreatePickupAddressCommand,
  string
> {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreatePickupAddressCommand): Promise<string> {
    return await this.uow.run(async () => {
      const pickupId = await this.pickups.create(command.payload);
      await this.events.publishTraced(new PickupAddressCreatedEvent(pickupId, command.payload));
      return pickupId;
    });
  }
}

@CommandHandler(UpdatePickupAddressCommand)
export class UpdatePickupAddressHandler implements ICommandHandler<
  UpdatePickupAddressCommand,
  void
> {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdatePickupAddressCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.pickups.update(command.id, command.payload);
      await this.events.publishTraced(new PickupAddressUpdatedEvent(command.id, command.payload));
    });
  }
}

@CommandHandler(RemovePickupAddressCommand)
export class RemovePickupAddressHandler implements ICommandHandler<
  RemovePickupAddressCommand,
  void
> {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemovePickupAddressCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.pickups.remove(command.id);
      await this.events.publishTraced(new PickupAddressRemovedEvent(command.id));
    });
  }
}

@CommandHandler(SetDefaultPickupAddressCommand)
export class SetDefaultPickupAddressHandler implements ICommandHandler<
  SetDefaultPickupAddressCommand,
  void
> {
  constructor(
    private readonly pickups: PickupAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetDefaultPickupAddressCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.pickups.setDefault(command.id);
      await this.events.publishTraced(new DefaultPickupAddressSetEvent(command.id));
    });
  }
}
