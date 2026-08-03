import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

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
  constructor(private readonly zones: DeliveryZoneRepository) {}

  execute(command: CreateDeliveryZoneCommand): Promise<string> {
    return this.zones.create(command.payload);
  }
}

@CommandHandler(UpdateDeliveryZoneCommand)
export class UpdateDeliveryZoneHandler implements ICommandHandler<UpdateDeliveryZoneCommand, void> {
  constructor(private readonly zones: DeliveryZoneRepository) {}

  async execute(command: UpdateDeliveryZoneCommand): Promise<void> {
    await this.zones.update(command.id, command.payload);
  }
}

@CommandHandler(RemoveDeliveryZoneCommand)
export class RemoveDeliveryZoneHandler implements ICommandHandler<RemoveDeliveryZoneCommand, void> {
  constructor(private readonly zones: DeliveryZoneRepository) {}

  async execute(command: RemoveDeliveryZoneCommand): Promise<void> {
    await this.zones.remove(command.id);
  }
}
