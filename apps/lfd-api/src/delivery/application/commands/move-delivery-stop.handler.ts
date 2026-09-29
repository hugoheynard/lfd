import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { citeOrder, DeliveryStopMovedEvent } from "../../domain/events/delivery-round.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { VehicleRepository } from "../../domain/ports/vehicle.repository.js";
import { moveDeliveryStop } from "../../domain/services/move-delivery-stop.js";
import { ensureRoundVehicleActive, loadRoundAt, referencesOf } from "../delivery-round-support.js";
import { MoveDeliveryStopCommand } from "./move-delivery-stop.command.js";

/**
 * **I7** — déplace un arrêt vers une autre tournée du même jour, en dernier.
 * La même ligne change de tournée (C11) ; les deux tournées s'écrivent
 * ensemble, sous leurs deux versions (C13). UN fait au journal, jamais un
 * retrait suivi d'un ajout (C7).
 *
 * @throws {DeliveryRoundNotFoundError} @throws {DeliveryRoundStaleError}
 * @throws {DeliveryStopNotFoundError} @throws {DeliveryStopClosedError}
 * @throws {SameRoundMoveError} @throws {CrossDayMoveError}
 * @throws {VehicleInactiveOnDayError} @throws {OrderAlreadyInRoundError}
 */
@CommandHandler(MoveDeliveryStopCommand)
export class MoveDeliveryStopHandler implements ICommandHandler<MoveDeliveryStopCommand, void> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly vehicles: VehicleRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: MoveDeliveryStopCommand): Promise<void> {
    const { toRoundId, fromVersion, toVersion } = command.payload;
    await this.uow.run(async () => {
      const from = await loadRoundAt(this.rounds, command.roundId, fromVersion);
      const to = await loadRoundAt(this.rounds, toRoundId, toVersion);
      const stop = moveDeliveryStop(from, to, command.stopId, this.clock.now());
      await ensureRoundVehicleActive(this.vehicles, to);
      await this.rounds.saveMove(from, to);
      const references = await referencesOf(this.orders, [stop.orderId]);
      await this.events.publishTraced(
        new DeliveryStopMovedEvent(
          from,
          to,
          citeOrder(stop.orderId, references),
          to.positionOf(stop.id),
        ),
      );
    });
  }
}
