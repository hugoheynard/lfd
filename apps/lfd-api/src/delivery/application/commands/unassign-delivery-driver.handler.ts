import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { DeliveryDriverUnassignedEvent } from "../../domain/events/delivery-round.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { citeDrivers } from "../delivery-driver-support.js";
import { loadRoundAt } from "../delivery-round-support.js";
import { UnassignDeliveryDriverCommand } from "./unassign-delivery-driver.command.js";

/**
 * **Retirer le livreur** d'une tournée encore au dépôt (plan « Ma tournée »,
 * MT-D2). Possible même s'il a perdu le droit de conduire : c'est le geste de
 * sortie de ce cas-là. Une tournée sans livreur n'écrit rien.
 *
 * @throws {DeliveryRoundNotFoundError} @throws {DeliveryRoundStaleError}
 * @throws {DeliveryRoundDepartedError}
 */
@CommandHandler(UnassignDeliveryDriverCommand)
export class UnassignDeliveryDriverHandler implements ICommandHandler<
  UnassignDeliveryDriverCommand,
  void
> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UnassignDeliveryDriverCommand): Promise<void> {
    await this.uow.run(async () => {
      const round = await loadRoundAt(this.rounds, command.roundId, command.payload.version);
      const previous = round.unassignDriver(this.clock.now());
      if (previous === null) {
        return;
      }
      await this.rounds.save(round);
      const cited = await citeDrivers(this.directory, [previous]);
      await this.events.publishTraced(
        new DeliveryDriverUnassignedEvent(round, cited.get(previous) ?? previous),
      );
    });
  }
}
