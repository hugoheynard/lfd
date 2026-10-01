import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { StaffPermissionHolders } from "../../../staff/directory/domain/staff-permission-holders.js";
import { DeliveryDriverAssignedEvent } from "../../domain/events/delivery-round.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { citeDrivers, driversNow } from "../delivery-driver-support.js";
import { loadRoundAt } from "../delivery-round-support.js";
import { AssignDeliveryDriverCommand } from "./assign-delivery-driver.command.js";

/**
 * **Affecter un livreur** (plan « Ma tournée », MT-D2 v2) — depuis l'écran
 * Tournées, sous `delivery_rounds:write`.
 *
 * Les livreurs possibles sont lus AU MOMENT DU GESTE par l'annuaire : ceux qui
 * tiennent effectivement `delivery_driving:write`. C'est l'agrégat qui refuse
 * une personne hors de cette liste, comme une tournée partie (I6). Réaffecter
 * le même livreur n'écrit rien.
 *
 * @throws {DeliveryRoundNotFoundError} @throws {DeliveryRoundStaleError}
 * @throws {DeliveryRoundDepartedError} @throws {DriverWithoutAccessError}
 */
@CommandHandler(AssignDeliveryDriverCommand)
export class AssignDeliveryDriverHandler implements ICommandHandler<
  AssignDeliveryDriverCommand,
  void
> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly holders: StaffPermissionHolders,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AssignDeliveryDriverCommand): Promise<void> {
    await this.uow.run(async () => {
      const round = await loadRoundAt(this.rounds, command.roundId, command.payload.version);
      const previous = round.driverStaffId;
      const drivers = await driversNow(this.holders);
      const driverId = command.payload.staffUserId;
      if (!round.assignDriver(driverId, drivers, this.clock.now())) {
        return;
      }
      await this.rounds.save(round);
      const cited = await citeDrivers(
        this.directory,
        previous === null ? [driverId] : [driverId, previous],
      );
      await this.events.publishTraced(
        new DeliveryDriverAssignedEvent(
          round,
          cited.get(driverId) ?? driverId,
          previous === null ? null : (cited.get(previous) ?? previous),
        ),
      );
    });
  }
}
