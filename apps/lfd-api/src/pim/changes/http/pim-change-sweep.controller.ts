import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { PrunePimChangesCommand } from "../application/prune-pim-changes.js";

/** Le compte rendu du passage : la seule observabilité d'un déclenchement machine. */
export interface PimChangeSweepReport {
  readonly pruned: number;
}

/**
 * Endpoint **batch** du balayage du journal du référentiel
 * (`le-cache-du-back-office.md`, § 5.2). Même porte machine-à-machine que
 * `admin/delivery/journal/sweep` : le `RecomputeGuard` et son jeton.
 *
 * Appelé par le cron nocturne des balayages (`QUALITY_UPLOAD_SWEEP_CRON`,
 * `container/worker.ts`). Une route à part, parce que la passe du commerce
 * qui balaie les autres journaux ne peut pas atteindre l'intérieur du
 * référentiel (`lint:context-boundaries`).
 */
@Controller("admin/pim/changes/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class PimChangeSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @Idempotent(
    "balayage appelé par la machine sous RecomputeGuard : il efface les traces d'avant la rétention, et un second passage ne trouve plus rien",
  )
  @HttpCode(200)
  async sweep(): Promise<PimChangeSweepReport> {
    const pruned = await this.commands.execute<PrunePimChangesCommand, number>(
      new PrunePimChangesCommand(),
    );
    return { pruned };
  }
}
