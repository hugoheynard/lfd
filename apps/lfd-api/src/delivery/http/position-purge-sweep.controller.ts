import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../platform/auth/recompute.guard.js";
import { PurgeStalePositionsCommand } from "../application/commands/purge-stale-positions.command.js";

/** Le compte rendu du passage : un compte, jamais une coordonnée ni un arrêt. */
export interface PositionPurgeSweepReport {
  readonly purged: number;
}

/**
 * Endpoint **batch** de la purge des positions au geste
 * (`documentation/livraisons/livreur/gps-y-aller-et-position.md`). Même porte
 * machine-à-machine que `admin/livraison/geocodage/sweep` : le `RecomputeGuard`
 * et son jeton. Appelé par le cron nocturne `QUALITY_UPLOAD_SWEEP_CRON`
 * (`container/worker.ts`), juste après la purge du géocodage.
 */
@Controller("admin/livraison/positions/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class PositionPurgeSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  async sweep(): Promise<PositionPurgeSweepReport> {
    const purged = await this.commands.execute<PurgeStalePositionsCommand, number>(
      new PurgeStalePositionsCommand(),
    );
    return { purged };
  }
}
