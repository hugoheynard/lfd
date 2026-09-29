import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryRound } from "../../domain/entities/delivery-round.js";
import { DeliveryRoundOpenedEvent } from "../../domain/events/delivery-round.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { VehicleRepository } from "../../domain/ports/vehicle.repository.js";
import { loadVehicle } from "../vehicle-support.js";
import { OpenDeliveryRoundCommand } from "./open-delivery-round.command.js";

/**
 * Ouvre une tournée pour un véhicule actif ce jour-là. Le passage est le
 * suivant de ce véhicule ce jour-là (Q13) ; deux ouvertures simultanées butent
 * sur l'unicité `(jour, véhicule, passage)` et la seconde est refusée.
 *
 * @throws {VehicleNotFoundError} @throws {VehicleInactiveOnDayError}
 * @throws {InvalidServiceDayError} @throws {DeliveryRoundStaleError}
 */
@CommandHandler(OpenDeliveryRoundCommand)
export class OpenDeliveryRoundHandler implements ICommandHandler<OpenDeliveryRoundCommand, string> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly vehicles: VehicleRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: OpenDeliveryRoundCommand): Promise<string> {
    const { day, vehicleId } = command.payload;
    return this.uow.run(async () => {
      const vehicle = await loadVehicle(this.vehicles, vehicleId);
      const round = DeliveryRound.open({
        id: this.ids.next(),
        serviceDay: day,
        vehicle,
        passage: await this.rounds.nextPassage(day, vehicle.id),
        at: this.clock.now(),
      });
      await this.rounds.save(round);
      await this.events.publishTraced(new DeliveryRoundOpenedEvent(round));
      return round.id;
    });
  }
}
