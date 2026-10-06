import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { Vehicle } from "../../domain/entities/vehicle.js";
import { VehicleAddedEvent } from "../../domain/events/vehicle.events.js";
import { VehicleRepository } from "../../domain/ports/vehicle.repository.js";
import { ensurePlateFree } from "../vehicle-support.js";
import { AddVehicleCommand } from "./add-vehicle.command.js";

/**
 * Un véhicule entre dans la flotte, en service. L'identifiant vient de
 * l'`IdGenerator`, l'instant du `Clock` ; l'écriture et sa trace partent
 * ensemble.
 *
 * @throws {InvalidLicensePlateError} @throws {InvalidVehicleNameError}
 * @throws {LicensePlateAlreadyInServiceError}
 * @throws {InvalidCargoDimensionsError} @throws {InvalidRefrigerationError}
 * @throws {RefrigeratedVolumeExceedsCargoError} @throws {InvalidVehicleEnergyError}
 * @throws {InvalidWheelArchesError} @throws {WheelArchesWithoutCargoError}
 */
@CommandHandler(AddVehicleCommand)
export class AddVehicleHandler implements ICommandHandler<AddVehicleCommand, string> {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AddVehicleCommand): Promise<string> {
    const vehicle = Vehicle.register({
      id: this.ids.next(),
      name: command.payload.name,
      plate: command.payload.plate,
      cargo: command.payload.cargo,
      wheelArches: command.payload.wheelArches,
      refrigeration: command.payload.refrigeration,
      energy: command.payload.energy,
      allowedZoneIds: command.payload.allowedZoneIds,
      at: this.clock.now(),
    });
    await this.uow.run(async () => {
      await ensurePlateFree(this.vehicles, vehicle);
      await this.vehicles.save(vehicle);
      await this.events.publishTraced(new VehicleAddedEvent(vehicle));
    });
    return vehicle.id;
  }
}
