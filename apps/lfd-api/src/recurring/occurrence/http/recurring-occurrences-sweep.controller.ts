import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import {
  SweepDueOccurrencesCommand,
  type RecurringOccurrencesSweepReport,
} from "../application/commands/sweep-due-occurrences.command.js";

/**
 * Le balayage des paniers récurrents, appelé par le cron
 * HORAIRE du Worker (`hourlySweeps`) : une échéance se passe une semaine
 * avant son jour, une heure de retard ne coûte rien, et chaque passage lit
 * la base. Même porte machine-à-machine que les autres balayages.
 */
@Controller("admin/subscriptions/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class RecurringOccurrencesSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  @Idempotent(
    "appelée par la machine sous RecomputeGuard : rejouée, une échéance passée ou manquée a quitté les états dus et n'est plus lue ; la commande d'une échéance est unique en base (orders_one_per_occurrence), et un refus se réécrit sur sa propre ligne",
  )
  sweep(): Promise<RecurringOccurrencesSweepReport> {
    return this.commands.execute<SweepDueOccurrencesCommand, RecurringOccurrencesSweepReport>(
      new SweepDueOccurrencesCommand(),
    );
  }
}
