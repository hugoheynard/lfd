import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { VehicleCorrectedEvent } from "../../domain/events/vehicle.events.js";
import { MeasuredVehiclesReader } from "../../domain/ports/composition-prerequisites.readers.js";
import { VehicleRepository } from "../../domain/ports/vehicle.repository.js";
import { ensureMeasuredVehicleRemains } from "../../domain/services/composition-prerequisites.js";
import { ensurePlateFree, loadVehicle } from "../vehicle-support.js";
import { CorrectVehicleCommand } from "./correct-vehicle.command.js";

/**
 * Corrige la fiche d'un véhicule (nom, plaque, dimensions, passages de roue,
 * froid). Le fait porte l'avant et l'après.
 *
 * @throws {VehicleNotFoundError} @throws {InvalidLicensePlateError}
 * @throws {InvalidVehicleNameError} @throws {LicensePlateAlreadyInServiceError}
 * @throws {InvalidWheelArchesError} @throws {WheelArchesWithoutCargoError}
 * @throws {LastMeasuredVehicleError} effacer les cotes du dernier véhicule en
 * service qui en a (CA-D3).
 */
@CommandHandler(CorrectVehicleCommand)
export class CorrectVehicleHandler implements ICommandHandler<CorrectVehicleCommand, void> {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly measured: MeasuredVehiclesReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CorrectVehicleCommand): Promise<void> {
    await this.uow.run(async () => {
      const vehicle = await loadVehicle(this.vehicles, command.vehicleId);
      const before = vehicle.identity;
      const wasMeasured = vehicle.measured;
      vehicle.correct(command.payload, this.clock.now());
      ensureMeasuredVehicleRemains({
        vehicle,
        wasMeasured,
        measuredIds: await this.measured.measuredIds(),
        gesture: "erase_cargo",
      });
      await ensurePlateFree(this.vehicles, vehicle);
      await this.vehicles.save(vehicle);
      await this.events.publishTraced(new VehicleCorrectedEvent(vehicle, before));
    });
  }
}
