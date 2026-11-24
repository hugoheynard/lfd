import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { PruneProvisionalPrintsCommand } from "../application/commands/prune-provisional-prints.command.js";

/** Le compte rendu du passage : la seule observabilité d'un déclenchement machine. */
export interface ProvisionalPrintSweepReport {
  readonly pruned: number;
}

/**
 * Endpoint **batch** du balayage des impressions provisoires des journées
 * passées (plan `documentation/fournil/plan-impression-provisoire.md`, § 2).
 * Même porte machine-à-machine que `admin/production/journal/sweep` : le
 * `RecomputeGuard` et son jeton.
 *
 * Appelé par le cron nocturne des balayages (`container/worker.ts`), juste
 * après l'élagage du journal des journées : une route à part, parce que les
 * impressions sont au plan, et que la journée n'importe pas le plan.
 */
@Controller("admin/production/provisional-prints/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class ProvisionalPrintSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @Idempotent(
    "balayage appelé par la machine sous RecomputeGuard : il efface les impressions des journées passées, et un second passage ne trouve plus rien",
  )
  @HttpCode(200)
  async sweep(): Promise<ProvisionalPrintSweepReport> {
    const pruned = await this.commands.execute<PruneProvisionalPrintsCommand, number>(
      new PruneProvisionalPrintsCommand(),
    );
    return { pruned };
  }
}
