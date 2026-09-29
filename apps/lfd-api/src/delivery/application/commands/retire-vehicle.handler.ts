import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { VehicleRetiredEvent } from "../../domain/events/vehicle.events.js";
import { VehicleRepository } from "../../domain/ports/vehicle.repository.js";
import { loadVehicle } from "../vehicle-support.js";
import { RetireVehicleCommand } from "./retire-vehicle.command.js";

/**
 * Retire un véhicule, daté du `Clock`. Il reste dans la flotte, et sa plaque
 * se libère pour un autre.
 *
 * @throws {VehicleNotFoundError} @throws {VehicleAlreadyRetiredError}
 */
@CommandHandler(RetireVehicleCommand)
export class RetireVehicleHandler implements ICommandHandler<RetireVehicleCommand, void> {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RetireVehicleCommand): Promise<void> {
    await this.uow.run(async () => {
      const vehicle = await loadVehicle(this.vehicles, command.vehicleId);
      vehicle.retire(this.clock.now());
      await this.vehicles.save(vehicle);
      await this.events.publishTraced(new VehicleRetiredEvent(vehicle));
    });
  }
}
