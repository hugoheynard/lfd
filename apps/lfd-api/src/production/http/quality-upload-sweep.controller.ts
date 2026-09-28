import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../platform/auth/recompute.guard.js";
import { PruneProductionDayChangesCommand } from "../application/commands/prune-production-day-changes.command.js";
import { SweepQualityUploadsCommand } from "../application/commands/sweep-quality-uploads.command.js";

/** Le compte rendu du passage : la seule observabilité d'un déclenchement machine. */
export interface QualityUploadSweepReport {
  readonly released: number;
}

/**
 * Endpoint **batch** du balayage des photos de contrôle en attente (plan
 * `plan-controle-qualite.md`, D8). Même porte machine-à-machine que
 * `admin/media/sweep` et `admin/loyalty/sweep` : le `RecomputeGuard` et son
 * jeton, présentés par le Worker sur un Cron Trigger.
 *
 * Appelé chaque nuit par le cron `45 3 * * *` (`QUALITY_UPLOAD_SWEEP_CRON`,
 * `container/worker.ts`, depuis `74672d5c6`).
 *
 * **Le même passage balaie le journal des journées du fournil**
 * (`plan-version-par-journee.md`, D2) : c'est le passage nocturne du schéma
 * `production`, et un second cron serait un réglage Cloudflare de plus pour
 * une suppression de quelques centaines de lignes. Deux commandes, deux
 * handlers — seule la porte est partagée. Le compte rendu reste celui des
 * photos : un balayage de numéros d'affichage n'a rien à y annoncer.
 */
@Controller("admin/production/quality/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class QualityUploadSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  async sweep(): Promise<QualityUploadSweepReport> {
    const released = await this.commands.execute<SweepQualityUploadsCommand, number>(
      new SweepQualityUploadsCommand(),
    );
    await this.commands.execute<PruneProductionDayChangesCommand, number>(
      new PruneProductionDayChangesCommand(),
    );
    return { released };
  }
}
