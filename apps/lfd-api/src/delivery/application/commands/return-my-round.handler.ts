import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DriverRoundNotFoundError } from "../../domain/errors/delivery-driver-errors.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { returnAndRecord } from "../delivery-return-support.js";
import { customerLabelsOf } from "../driver-refusals.js";
import { ReturnMyRoundCommand } from "./return-my-round.command.js";

/**
 * **« Tournée terminée »** — la porte du LIVREUR (`parcours-du-livreur.md`,
 * PL2) : les bacs vides sont rentrés. La tournée est chargée et verrouillée
 * SOUS LE MUR du livreur ; une tournée d'un autre est un 404 qui ne confirme
 * rien. Idempotente : déjà rentrée, 204 sans rien écrire.
 *
 * Refusée tant qu'un arrêt n'a pas de sort (`DeliveryRound.finish`, I9 —
 * `plan-a-la-porte.md` § 10 B4) ; le refus nomme les arrêts par leur client
 * et leur numéro. Une tournée partie sous l'ancien code n'est pas rattrapée :
 * la règle s'applique à son prochain « Tournée terminée ».
 *
 * @throws {DriverRoundNotFoundError} @throws {RoundNotDepartedForReturnError}
 * @throws {RoundStopsWithoutOutcomeError}
 */
@CommandHandler(ReturnMyRoundCommand)
export class ReturnMyRoundHandler implements ICommandHandler<ReturnMyRoundCommand, void> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly orders: DeliveryOrdersReader,
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
      const labels = await customerLabelsOf(this.orders, round.orderIds);
      const returned = await returnAndRecord(
        round,
        command.staffUserId,
        { rounds: this.rounds, directory: this.directory, clock: this.clock },
        (at, by) => round.finish(at, by, labels),
      );
      if (returned !== null) {
        await this.events.publishTraced(returned);
      }
    });
  }
}
