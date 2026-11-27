import type { PlannedColumnWritten } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { parisDay } from "../../../basket/application/services/paris-day.js";
import type { PlannedColumn, PlannedColumnMoment } from "../../domain/entities/planned-column.js";
import {
  PlannedColumnNotFoundError,
  PlannedColumnVersionConflictError,
} from "../../domain/errors/planned-column-errors.js";
import { PlannedColumnRepository } from "../../domain/ports/planned-column.repository.js";
import { PlannedLine } from "../../domain/value-objects/planned-line.js";
import { ConversionSchedule } from "../services/conversion-schedule.js";
import { PlannerWall } from "../services/planner-wall.js";
import { PutPlannedColumnCommand } from "./put-planned-column.command.js";

/**
 * **Écrit une colonne** : ses lignes et son acheminement, en entier, puis son
 * instant de conversion, redemandé au commerce sur les lignes écrites.
 * L'agrégat refuse un jour passé ou une colonne gelée ; la version lue
 * refuse l'écrasement d'un autre onglet.
 *
 * **Rejouée, elle ne refait rien** : la même colonne réécrite ne change rien,
 * et rend la version en place sans juger la version reçue — un double envoi
 * n'est pas un conflit.
 *
 * @sans-journal une colonne est un brouillon : elle ne réserve rien, le fournil
 * ne la voit pas, et rien ne se fabrique ni ne se facture tant qu'elle n'est
 * pas convertie. C'est la conversion qui laisse une trace (la commande).
 */
@CommandHandler(PutPlannedColumnCommand)
export class PutPlannedColumnHandler implements ICommandHandler<
  PutPlannedColumnCommand,
  PlannedColumnWritten
> {
  constructor(
    private readonly wall: PlannerWall,
    private readonly columns: PlannedColumnRepository,
    private readonly schedule: ConversionSchedule,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {PlannerProOnlyError} espace personnel.
   * @throws {PlannerMembershipLostError} la personne n'est plus membre de la société.
   * @throws {PlannerClosedError} le planificateur n'est pas ouvert à cette personne.
   * @throws {PlannedColumnNotFoundError} absente, retirée, ou d'une autre société.
   * @throws {PlannedColumnInPastError} le jour est passé.
   * @throws {PlannedColumnFrozenError} la colonne se commande ou s'est commandée.
   * @throws {PlannedColumnVersionConflictError} écrite ailleurs depuis la lecture.
   * @throws {PlannedWindowTakenError} le nouveau créneau est occupé par une autre colonne.
   */
  async execute(command: PutPlannedColumnCommand): Promise<PlannedColumnWritten> {
    const companyId = await this.wall.companyOf(
      command.actorUserId,
      command.companyId,
      command.caller,
    );
    const lines = command.payload.lines.map((line) => PlannedLine.create(line.sku, line.quantity));
    const now = this.clock.now();
    const moment: PlannedColumnMoment = { now, today: parisDay(now) };
    return this.uow.run(async () => {
      const column = await this.columns.load(companyId, command.columnId);
      if (column === null || column.isWithdrawn) {
        throw new PlannedColumnNotFoundError(command.columnId);
      }
      if (!edit(column, command, lines, moment)) {
        return { version: column.version };
      }
      if (command.payload.version !== column.version) {
        throw new PlannedColumnVersionConflictError(column.serviceDay.value);
      }
      column.writtenBy(command.actorUserId);
      // L'instant du gel suit les lignes : chaque écriture le redemande (§ 4).
      const instants = await this.schedule.instantsOf([column], now);
      column.scheduleConversion(instants.get(column.id) ?? null);
      return { version: await this.columns.save(column, now) };
    });
  }
}

/** Les deux gestes de l'agrégat ; vrai si l'un a changé la colonne. */
function edit(
  column: PlannedColumn,
  command: PutPlannedColumnCommand,
  lines: readonly PlannedLine[],
  moment: PlannedColumnMoment,
): boolean {
  const linesChanged = column.replaceLines(lines, moment);
  const routingChanged = column.reroute(command.payload.routing, moment);
  return linesChanged || routingChanged;
}
