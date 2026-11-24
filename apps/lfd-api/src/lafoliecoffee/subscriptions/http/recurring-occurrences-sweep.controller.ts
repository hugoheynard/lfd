import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import {
  SweepRecurringOccurrencesCommand,
  type RecurringOccurrencesSweepReport,
} from "../application/commands/sweep-recurring-occurrences.command.js";

/**
 * Le balayage du planificateur des paniers récurrents, appelé par le cron
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
    "appelée par la machine sous RecomputeGuard : rejouée, une échéance générée ou manquée est close au registre (unique par panier et par jour) et n'est pas repassée ; un refus est réécrit sur sa propre ligne",
  )
  sweep(): Promise<RecurringOccurrencesSweepReport> {
    return this.commands.execute<SweepRecurringOccurrencesCommand, RecurringOccurrencesSweepReport>(
      new SweepRecurringOccurrencesCommand(),
    );
  }
}
