import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { VehicleCorrectedEvent } from "../../domain/events/vehicle.events.js";
import { VehicleRepository } from "../../domain/ports/vehicle.repository.js";
import { ensurePlateFree, loadVehicle } from "../vehicle-support.js";
import { CorrectVehicleCommand } from "./correct-vehicle.command.js";

/**
 * Corrige le nom et la plaque d'un véhicule. Le fait porte l'avant et l'après.
 *
 * @throws {VehicleNotFoundError} @throws {InvalidLicensePlateError}
 * @throws {InvalidVehicleNameError} @throws {LicensePlateAlreadyInServiceError}
 */
@CommandHandler(CorrectVehicleCommand)
export class CorrectVehicleHandler implements ICommandHandler<CorrectVehicleCommand, void> {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CorrectVehicleCommand): Promise<void> {
    await this.uow.run(async () => {
      const vehicle = await loadVehicle(this.vehicles, command.vehicleId);
      const before = { name: vehicle.name, plate: vehicle.plate.value };
      vehicle.correct(command.payload, this.clock.now());
      await ensurePlateFree(this.vehicles, vehicle);
      await this.vehicles.save(vehicle);
      await this.events.publishTraced(new VehicleCorrectedEvent(vehicle, before));
    });
  }
}
