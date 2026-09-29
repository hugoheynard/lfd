import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { DepartureCandidatesReader } from "../../channels/commerce/index.js";
import { DepartureChoice } from "../../domain/entities/departure-choice.js";
import { DeparturePointNotFoundError } from "../../domain/errors/delivery-errors.js";
import { type CitedPoint, DepartureChosenEvent } from "../../domain/events/departure.events.js";
import { DepartureReader } from "../../domain/ports/departure.reader.js";
import { DepartureRepository } from "../../domain/ports/departure.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { ChooseDepartureCommand } from "./choose-departure.command.js";

/**
 * Pose le point de départ des tournées. Le point doit être un point de retrait
 * EXISTANT — vérifié contre le commerce, qui en est la seule source ; on ne
 * référence pas un identifiant que personne ne sait résoudre.
 *
 * @throws {DeparturePointNotFoundError}
 */
@CommandHandler(ChooseDepartureCommand)
export class ChooseDepartureHandler implements ICommandHandler<ChooseDepartureCommand, void> {
  constructor(
    private readonly candidates: DepartureCandidatesReader,
    private readonly reader: DepartureReader,
    private readonly departures: DepartureRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ChooseDepartureCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const points = await this.candidates.list();
      const point = points.find(
        (candidate) => candidate.pickupAddressId === command.pickupAddressId,
      );
      if (point === undefined) {
        throw new DeparturePointNotFoundError(command.pickupAddressId);
      }
      const previousId = await this.reader.chosenPickupAddressId();
      const choice = DepartureChoice.choose({
        pickupAddressId: point.pickupAddressId,
        at: this.clock.now(),
        author,
      });
      await this.departures.put(choice);
      await this.events.publishTraced(
        new DepartureChosenEvent(choice, point.label, cite(previousId, points)),
      );
    });
  }
}

/** Le choix remplacé : nommé s'il est encore un point de retrait, nu sinon. */
function cite(
  id: string | null,
  points: readonly { readonly pickupAddressId: string; readonly label: string }[],
): CitedPoint | null {
  if (id === null) {
    return null;
  }
  const found = points.find((point) => point.pickupAddressId === id);
  return found === undefined ? id : { id, name: found.label };
}
