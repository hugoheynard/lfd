import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
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
 * **Une fois par intention** : la clé de l'écran est scellée dans la même
 * unité de travail que l'entrée du véhicule ; un rejeu de la même clé rend le
 * même identifiant sans rien écrire.
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
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: AddVehicleCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "delivery.vehicle.add",
        subject: "new",
      },
      CREATED_ID_REPLAY,
      (seal) => this.add(command, seal),
    );
  }

  private async add(
    command: AddVehicleCommand,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
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
      await seal(vehicle.id);
    });
    return vehicle.id;
  }
}
