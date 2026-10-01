import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { DriverRoundNotFoundError } from "../../domain/errors/delivery-driver-errors.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { returnAndRecord } from "../delivery-return-support.js";
import { ReturnMyRoundCommand } from "./return-my-round.command.js";

/**
 * **« Tournée terminée »** — la porte du LIVREUR (`parcours-du-livreur.md`,
 * PL2) : les bacs vides sont rentrés. La tournée est chargée et verrouillée
 * SOUS LE MUR du livreur ; une tournée d'un autre est un 404 qui ne confirme
 * rien. Idempotente : déjà rentrée, 204 sans rien écrire.
 *
 * @throws {DriverRoundNotFoundError} @throws {RoundNotDepartedForReturnError}
 */
@CommandHandler(ReturnMyRoundCommand)
export class ReturnMyRoundHandler implements ICommandHandler<ReturnMyRoundCommand, void> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReturnMyRoundCommand): Promise<void> {
    await this.uow.run(async () => {
      const round = await this.rounds.loadForDriver(command.roundId, command.staffUserId);
      if (round === null) {
        throw new DriverRoundNotFoundError();
      }
      const returned = await returnAndRecord(round, command.staffUserId, {
        rounds: this.rounds,
        directory: this.directory,
        clock: this.clock,
      });
      if (returned !== null) {
        await this.events.publishTraced(returned);
      }
    });
  }
}
