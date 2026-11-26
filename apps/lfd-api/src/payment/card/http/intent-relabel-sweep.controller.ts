import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import {
  type IntentRelabelSweepReport,
  SweepIntentRelabelsCommand,
} from "../application/commands/sweep-intent-relabels.command.js";

/**
 * Endpoint **batch** des libellés d'intention dus (plan
 * `documentation/payment/plan-pointage-stripe.md`, lot 2) — la porte
 * machine-à-machine des autres balayages du bloc : le `RecomputeGuard` et son
 * jeton, présentés par le cron de RAFRAÎCHISSEMENT du Worker
 * (`container/worker.ts`, toutes les cinq minutes).
 */
@Controller("admin/card-payments/labels/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class IntentRelabelSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  @Idempotent(
    "appelée par la machine (RecomputeGuard) : poser deux fois le même libellé chez le prestataire laisse la même intention, et l'issue s'écrit conditionnée à la révision lue",
  )
  sweep(): Promise<IntentRelabelSweepReport> {
    return this.commands.execute<SweepIntentRelabelsCommand, IntentRelabelSweepReport>(
      new SweepIntentRelabelsCommand(),
    );
  }
}
