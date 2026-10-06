import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../platform/auth/recompute.guard.js";
import {
  RunAutoCloseRoundCommand,
  type AutoCloseRoundReport,
} from "../application/commands/run-auto-close-round.command.js";

/**
 * Endpoint **machine** du tour de l'arrêt du plan (plan
 * `documentation/production/plan-arret-du-plan.md`, §3, lot A2). Même porte
 * que `admin/production/quality/sweep` et `admin/outbox/sweep` : le
 * `RecomputeGuard` et son jeton, présentés par le Worker sur le cron de
 * rafraîchissement, toutes les cinq minutes (`container/worker.ts`). Pas de droit staff.
 *
 * Idempotent : un tour rejoué ne tente pas deux fois et ne sonne pas deux fois.
 */
@Controller("admin/production/auto-close")
@Public()
@UseGuards(RecomputeGuard)
export class AutoCloseController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  async run(): Promise<AutoCloseRoundReport> {
    return this.commands.execute<RunAutoCloseRoundCommand, AutoCloseRoundReport>(
      new RunAutoCloseRoundCommand(),
    );
  }
}
