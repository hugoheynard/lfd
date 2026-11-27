import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { parisDay } from "../../../basket/application/services/paris-day.js";
import type { PlannedColumn } from "../../domain/entities/planned-column.js";
import { PlannedColumnVersionConflictError } from "../../domain/errors/planned-column-errors.js";
import { PlannedColumnRepository } from "../../domain/ports/planned-column.repository.js";
import { conversionMissed } from "../../domain/services/conversion-instant.js";
import { ConversionSchedule } from "../services/conversion-schedule.js";
import {
  type ConversionResult,
  PlannedColumnConversion,
} from "../services/planned-column-conversion.js";
import {
  type PlannerSweepReport,
  SweepPlannedColumnsCommand,
} from "./sweep-planned-columns.command.js";

/** Au plus autant de colonnes par passage : le balayage reste borné, le suivant reprend. */
export const PLANNER_BATCH = 200;
/** Le balayage lit les colonnes servies au plus tard après-demain (§ 4). */
export const PLANNER_SWEEP_DAYS = 2;

type Tally = { -readonly [K in keyof PlannerSweepReport]: PlannerSweepReport[K] };

/**
 * **Le balayage du planificateur** (cron des cinq minutes du Worker ; plan du
 * planificateur, § 4) : les colonnes en brouillon des deux prochains jours,
 * et celles dont l'instant de conversion rangé est atteint, quel que soit
 * leur jour — un article qui ferme plus de deux jours avant le jour servi
 * échapperait sinon à la fenêtre. Même borne par passage.
 *
 * Pour chacune : une colonne vide est laissée (elle reste brouillon, rien
 * n'est alerté) ; une colonne dont la fermeture rangée est passée sans
 * conversion, ou d'un jour déjà passé, est **manquée** ; les autres voient
 * leur instant de conversion redemandé au commerce — une limite d'article
 * peut avoir changé depuis l'écriture —, et celles dont l'instant est
 * atteint sont converties. Une erreur technique n'arrête pas le balayage :
 * comptée, journalisée, reprise au passage suivant.
 *
 * @sans-journal le balayage est la machine, pas une décision : chaque
 * commande passée garde sa trace par la passation, et chaque issue s'écrit
 * sur sa colonne, avec le fait qui sonne la cloche du staff.
 */
@CommandHandler(SweepPlannedColumnsCommand)
export class SweepPlannedColumnsHandler implements ICommandHandler<
  SweepPlannedColumnsCommand,
  PlannerSweepReport
> {
  private readonly logger = new Logger(SweepPlannedColumnsHandler.name);

  constructor(
    private readonly columns: PlannedColumnRepository,
    private readonly schedule: ConversionSchedule,
    private readonly conversion: PlannedColumnConversion,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<PlannerSweepReport> {
    const now = this.clock.now();
    const today = parisDay(now);
    const drafts = await this.columns.draftsToSweep(
      { lastDay: today.plusDays(PLANNER_SWEEP_DAYS), now },
      PLANNER_BATCH,
    );
    const live = drafts.filter((column) => column.hasLines);
    const tally: Tally = {
      due: live.length,
      placed: 0,
      refused: 0,
      missed: 0,
      rescheduled: 0,
      failed: 0,
    };
    const isMissed = (column: PlannedColumn): boolean =>
      column.serviceDay.isBefore(today) || conversionMissed(column.convertsAt, now);
    for (const column of live.filter(isMissed)) {
      count(tally, await this.conversion.miss(column));
    }
    await this.convertDue(
      live.filter((column) => !isMissed(column)),
      now,
      tally,
    );
    return tally;
  }

  private async convertDue(
    columns: readonly PlannedColumn[],
    now: Date,
    tally: Tally,
  ): Promise<void> {
    let instants: ReadonlyMap<string, Date | null>;
    try {
      instants = await this.schedule.instantsOf(columns, now);
    } catch (error) {
      tally.failed += columns.length;
      this.logger.error(
        `Fermetures des colonnes planifiées illisibles, reprises au prochain passage : ${String(error)}`,
      );
      return;
    }
    for (const column of columns) {
      const at = instants.get(column.id) ?? null;
      const changed = column.scheduleConversion(at);
      if (at !== null && at.getTime() <= now.getTime()) {
        count(tally, await this.conversion.convert(column));
      } else if (changed && (await this.reschedule(column, now))) {
        tally.rescheduled += 1;
      }
    }
  }

  /** Range le nouvel instant ; faux si le client a écrit la colonne entre-temps (il l'a recalculé). */
  private async reschedule(column: PlannedColumn, now: Date): Promise<boolean> {
    try {
      await this.columns.save(column, now);
      return true;
    } catch (error) {
      if (error instanceof PlannedColumnVersionConflictError) {
        return false;
      }
      throw error;
    }
  }
}

function count(tally: Tally, result: ConversionResult): void {
  if (result !== "lost") {
    tally[result] += 1;
  }
}
