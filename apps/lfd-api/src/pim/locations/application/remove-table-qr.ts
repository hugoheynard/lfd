import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { LocationRepository } from "../domain/ports/location.repository.js";
import { LocationTableNotFoundError } from "../domain/errors/locations-errors.js";
import { requireLocation } from "./location-support.js";

export class RemoveTableQrCommand {
  constructor(
    readonly locationId: string,
    readonly tableNumber: number,
  ) {}
}

@CommandHandler(RemoveTableQrCommand)
export class RemoveTableQrHandler implements ICommandHandler<RemoveTableQrCommand, void> {
  constructor(private readonly locations: LocationRepository) {}

  async execute(command: RemoveTableQrCommand): Promise<void> {
    const location = await requireLocation(this.locations, command.locationId);
    if (!location.detachQr(command.tableNumber)) {
      throw new LocationTableNotFoundError(command.locationId, command.tableNumber);
    }
    await this.locations.save(location);
  }
}
