import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { PruneProductionDayChangesCommand } from "../application/commands/prune-production-day-changes.command.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/** Le compte rendu du passage : la seule observabilité d'un déclenchement machine. */
export interface ProductionDayChangeSweepReport {
  readonly pruned: number;
}

/**
 * Endpoint **batch** de l'élagage du journal des journées du fournil
 * (`version-par-journee.md`, D2). Même porte machine-à-machine que
 * `admin/delivery/journal/sweep` : le `RecomputeGuard` et son jeton.
 *
 * Appelé par le cron nocturne des balayages (`QUALITY_UPLOAD_SWEEP_CRON`,
 * `container/worker.ts`), juste après le balayage des photos de contrôle :
 * une route à part, parce que le journal est celui de la journée et que la
 * qualité ne la porte pas.
 */
@Controller("admin/production/journal/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class ProductionDayChangeSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @Idempotent(
    "balayage appelé par la machine sous RecomputeGuard : il efface l'historique d'avant la rétention, et un second passage ne trouve plus rien",
  )
  @HttpCode(200)
  async sweep(): Promise<ProductionDayChangeSweepReport> {
    const pruned = await this.commands.execute<PruneProductionDayChangesCommand, number>(
      new PruneProductionDayChangesCommand(),
    );
    return { pruned };
  }
}
