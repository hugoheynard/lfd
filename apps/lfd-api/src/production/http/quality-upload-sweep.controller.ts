import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../platform/auth/recompute.guard.js";
import { SweepQualityUploadsCommand } from "../application/commands/sweep-quality-uploads.command.js";
import { Idempotent } from "../../platform/shared/http/idempotent.decorator.js";

/** Le compte rendu du passage : la seule observabilité d'un déclenchement machine. */
export interface QualityUploadSweepReport {
  readonly released: number;
}

/**
 * Endpoint **batch** du balayage des photos de contrôle en attente (plan
 * `le-controle-qualite.md`, D8). Même porte machine-à-machine que
 * `admin/media/sweep` et `admin/loyalty/sweep` : le `RecomputeGuard` et son
 * jeton, présentés par le Worker sur un Cron Trigger.
 *
 * Appelé chaque nuit par le cron `45 3 * * *` (`QUALITY_UPLOAD_SWEEP_CRON`,
 * `container/worker.ts`, depuis `74672d5c6`).
 *
 * Le journal des journées du fournil a sa propre route
 * (`admin/production/journal/sweep`), appelée par le même cron juste après :
 * la qualité ne porte pas la journée.
 */
@Controller("admin/production/quality/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class QualityUploadSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @Idempotent(
    "balayage appelé par la machine sous RecomputeGuard, état relu : il ne libère que les dépôts expirés pas encore libérés — un second passage ne trouve plus rien",
  )
  @HttpCode(200)
  async sweep(): Promise<QualityUploadSweepReport> {
    const released = await this.commands.execute<SweepQualityUploadsCommand, number>(
      new SweepQualityUploadsCommand(),
    );
    return { released };
  }
}
