import { instantToLocal } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { VehicleHasUpcomingRoundsError } from "../../domain/errors/delivery-round-errors.js";
import { VehicleRetiredEvent } from "../../domain/events/vehicle.events.js";
import { VehicleRoundsReader } from "../../domain/ports/vehicle-rounds.reader.js";
import { VehicleRepository } from "../../domain/ports/vehicle.repository.js";
import { loadVehicle } from "../vehicle-support.js";
import { RetireVehicleCommand } from "./retire-vehicle.command.js";

/**
 * Retire un véhicule, daté du `Clock`. Il reste dans la flotte, et sa plaque
 * se libère pour un autre.
 *
 * **Refusé s'il porte une tournée vivante APRÈS aujourd'hui** (jour de Paris du
 * `Clock` — plan de tournée, lot 3, C14) : le refus nomme les jours, pour qu'on
 * réaffecte d'abord. La tournée d'aujourd'hui, elle, ne retient pas : un
 * véhicule retiré aujourd'hui roule encore aujourd'hui (`activeOnDay`).
 *
 * ⚠️ Vérifié ICI, pas interdit en base : une affectation et un retrait
 * strictement simultanés passeraient tous les deux. Le cas est signalé à la
 * lecture (`vehicleRetired` dans la vue du jour), jamais silencieux.
 *
 * @throws {VehicleNotFoundError} @throws {VehicleAlreadyRetiredError}
 * @throws {VehicleHasUpcomingRoundsError}
 */
@CommandHandler(RetireVehicleCommand)
export class RetireVehicleHandler implements ICommandHandler<RetireVehicleCommand, void> {
  constructor(
    private readonly vehicles: VehicleRepository,
    private readonly rounds: VehicleRoundsReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RetireVehicleCommand): Promise<void> {
    await this.uow.run(async () => {
      const vehicle = await loadVehicle(this.vehicles, command.vehicleId);
      const now = this.clock.now();
      const upcoming = await this.rounds.liveDaysAfter(vehicle.id, instantToLocal(now).day);
      if (upcoming.length > 0) {
        throw new VehicleHasUpcomingRoundsError(vehicle.name, upcoming);
      }
      vehicle.retire(now);
      await this.vehicles.save(vehicle);
      await this.events.publishTraced(new VehicleRetiredEvent(vehicle));
    });
  }
}
