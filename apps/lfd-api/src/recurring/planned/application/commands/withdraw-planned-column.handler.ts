import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { parisDay } from "../../../basket/application/services/paris-day.js";
import { PlannedColumnNotFoundError } from "../../domain/errors/planned-column-errors.js";
import { PlannedColumnRepository } from "../../domain/ports/planned-column.repository.js";
import { PlannerWall } from "../services/planner-wall.js";
import { WithdrawPlannedColumnCommand } from "./withdraw-planned-column.command.js";

/**
 * **Retire une colonne**, tant qu'elle est en brouillon et avant son gel. Elle
 * reste en base, retirée (pas de suppression physique), et libère son
 * créneau. Retirer une colonne déjà retirée ne refait rien.
 *
 * @sans-journal une colonne est un brouillon : elle ne réserve rien, le fournil
 * ne la voit pas, et rien ne se fabrique ni ne se facture.
 */
@CommandHandler(WithdrawPlannedColumnCommand)
export class WithdrawPlannedColumnHandler implements ICommandHandler<
  WithdrawPlannedColumnCommand,
  void
> {
  constructor(
    private readonly wall: PlannerWall,
    private readonly columns: PlannedColumnRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {PlannerProOnlyError} espace personnel.
   * @throws {PlannerMembershipLostError} la personne n'est plus membre de la société.
   * @throws {PlannerClosedError} le planificateur n'est pas ouvert à cette personne.
   * @throws {PlannedColumnNotFoundError} absente, ou d'une autre société.
   * @throws {PlannedColumnFrozenError} la colonne se commande ou s'est commandée.
   */
  async execute(command: WithdrawPlannedColumnCommand): Promise<void> {
    const companyId = await this.wall.companyOf(
      command.actorUserId,
      command.companyId,
      command.caller,
    );
    const now = this.clock.now();
    await this.uow.run(async () => {
      const column = await this.columns.load(companyId, command.columnId);
      if (column === null) {
        throw new PlannedColumnNotFoundError(command.columnId);
      }
      if (column.withdraw({ now, today: parisDay(now) })) {
        column.writtenBy(command.actorUserId);
        await this.columns.save(column, now);
      }
    });
  }
}
