import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

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
  constructor(private readonly pickups: PickupAddressRepository) {}

  execute(command: CreatePickupAddressCommand): Promise<string> {
    return this.pickups.create(command.payload);
  }
}

@CommandHandler(UpdatePickupAddressCommand)
export class UpdatePickupAddressHandler implements ICommandHandler<
  UpdatePickupAddressCommand,
  void
> {
  constructor(private readonly pickups: PickupAddressRepository) {}

  async execute(command: UpdatePickupAddressCommand): Promise<void> {
    await this.pickups.update(command.id, command.payload);
  }
}

@CommandHandler(RemovePickupAddressCommand)
export class RemovePickupAddressHandler implements ICommandHandler<
  RemovePickupAddressCommand,
  void
> {
  constructor(private readonly pickups: PickupAddressRepository) {}

  async execute(command: RemovePickupAddressCommand): Promise<void> {
    await this.pickups.remove(command.id);
  }
}

@CommandHandler(SetDefaultPickupAddressCommand)
export class SetDefaultPickupAddressHandler implements ICommandHandler<
  SetDefaultPickupAddressCommand,
  void
> {
  constructor(private readonly pickups: PickupAddressRepository) {}

  async execute(command: SetDefaultPickupAddressCommand): Promise<void> {
    await this.pickups.setDefault(command.id);
  }
}
