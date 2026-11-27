import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import {
  type PlannerSweepReport,
  SweepPlannedColumnsCommand,
} from "../application/commands/sweep-planned-columns.command.js";

/**
 * Le balayage du planificateur des pros, appelé par le cron des CINQ MINUTES
 * du Worker (`refreshSweeps`) : une colonne se commande quinze minutes avant
 * la première fermeture de ses lignes, et une heure de retard serait une
 * heure limite manquée. Même porte machine-à-machine que les autres balayages.
 */
@Controller("admin/planner/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class PlannerSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  @Idempotent(
    "appelée par la machine sous RecomputeGuard : rejouée, une colonne convertie, refusée ou manquée a quitté le brouillon et n'est plus lue ; la commande d'une colonne est unique en base (orders_one_per_planned_column), et l'issue s'écrit sous la version lue",
  )
  sweep(): Promise<PlannerSweepReport> {
    return this.commands.execute<SweepPlannedColumnsCommand, PlannerSweepReport>(
      new SweepPlannedColumnsCommand(),
    );
  }
}
