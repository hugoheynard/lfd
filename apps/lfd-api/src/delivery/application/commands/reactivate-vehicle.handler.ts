import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { VehicleReactivatedEvent } from "../../domain/events/vehicle.events.js";
import { VehicleRepository } from "../../domain/ports/vehicle.repository.js";
import { ensurePlateFree, loadVehicle } from "../vehicle-support.js";
import { ReactivateVehicleCommand } from "./reactivate-vehicle.command.js";

/**
 * Remet un véhicule en service. Sa plaque a pu être rendue à un autre pendant
 * son retrait : le refus nomme alors ce véhicule, jamais un 500.
 *
 * @throws {VehicleNotFoundError} @throws {VehicleNotRetiredError}
 * @throws {LicensePlateAlreadyInServiceError}
 */
@CommandHandler(ReactivateVehicleCommand)
export class ReactivateVehicleHandler implements ICommandHandler<ReactivateVehicleCommand, void> {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReactivateVehicleCommand): Promise<void> {
    await this.uow.run(async () => {
      const vehicle = await loadVehicle(this.vehicles, command.vehicleId);
      vehicle.reactivate(this.clock.now());
      await ensurePlateFree(this.vehicles, vehicle);
      await this.vehicles.save(vehicle);
      await this.events.publishTraced(new VehicleReactivatedEvent(vehicle));
    });
  }
}
