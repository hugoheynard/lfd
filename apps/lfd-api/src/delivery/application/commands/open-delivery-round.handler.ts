import { instantToLocal } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { ensureServiceDayNotPast } from "../../domain/services/composable-day.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../platform/intent/intent-subject.js";
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
 * **Une fois par intention** : un passage de plus est un ajout, et un double
 * clic en ouvrirait deux. La clé de l'écran est scellée avec l'ouverture ; un
 * rejeu de la même clé rend la même tournée.
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
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: OpenDeliveryRoundCommand): Promise<string> {
    const { day, vehicleId } = command.payload;
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "delivery.round.open",
        subject: intentSubject(`${day}/${vehicleId}`, command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) => this.open(command, seal),
    );
  }

  private async open(
    command: OpenDeliveryRoundCommand,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    const { day, vehicleId } = command.payload;
    const at = this.clock.now();
    // Avant toute lecture : une journée passée ne s'ouvre plus (2026-10-26).
    ensureServiceDayNotPast(day, instantToLocal(at).day);
    return this.uow.run(async () => {
      const vehicle = await loadVehicle(this.vehicles, vehicleId);
      const round = DeliveryRound.open({
        id: this.ids.next(),
        serviceDay: day,
        vehicle,
        passage: await this.rounds.nextPassage(day, vehicle.id),
        at,
      });
      await this.rounds.save(round);
      await this.events.publishTraced(new DeliveryRoundOpenedEvent(round));
      await seal(round.id);
      return round.id;
    });
  }
}
