import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { DeliveryRoundNotFoundError } from "../../domain/errors/delivery-round-errors.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { returnAndRecord } from "../delivery-return-support.js";
import { ReturnDeliveryRoundCommand } from "./return-delivery-round.command.js";

/**
 * **« Tournée terminée »** par l'admin (`parcours-du-livreur.md`, PL2) — le
 * livreur qui a oublié, une tournée sans livreur partie par le chargeur. La
 * tournée est verrouillée comme au départ ; idempotente.
 *
 * **Elle n'exige PAS un sort pour chaque arrêt** (`plan-a-la-porte.md`,
 * § 10 B4, § 10 bis SÉRIEUX 4) : c'est la sortie de secours quand le livreur
 * est bloqué. Ses arrêts sans sort restent ouverts et paraissent dans
 * « Non remis » (AP-D7).
 *
 * @throws {DeliveryRoundNotFoundError} @throws {RoundNotDepartedForReturnError}
 */
@CommandHandler(ReturnDeliveryRoundCommand)
export class ReturnDeliveryRoundHandler implements ICommandHandler<
  ReturnDeliveryRoundCommand,
  void
> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReturnDeliveryRoundCommand): Promise<void> {
    await this.uow.run(async () => {
      const round = await this.rounds.loadForDeparture(command.roundId);
      if (round === null) {
        throw new DeliveryRoundNotFoundError(command.roundId);
      }
      const returned = await returnAndRecord(
        round,
        command.staffUserId,
        {
          rounds: this.rounds,
          directory: this.directory,
          clock: this.clock,
        },
        (at, by) => round.returnToDepot(at, by),
      );
      if (returned !== null) {
        await this.events.publishTraced(returned);
      }
    });
  }
}
