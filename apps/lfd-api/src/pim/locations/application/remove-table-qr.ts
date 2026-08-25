import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
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
  constructor(
    private readonly locations: LocationRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveTableQrCommand): Promise<void> {
    const location = await requireLocation(this.locations, command.locationId);
    if (!location.detachQr(command.tableNumber)) {
      throw new LocationTableNotFoundError(command.locationId, command.tableNumber);
    }
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.locationTableQrRemoved,
        subjectType: "location",
        subjectId: command.locationId,
        payload: { table: command.tableNumber },
      });
      await this.locations.save(location, ticket);
    });
  }
}
