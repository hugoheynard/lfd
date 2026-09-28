import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../platform/auth/recompute.guard.js";
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
 * ⚠️ **Aucun cron ne l'appelle encore** (2026-09-28) : le brancher, c'est une
 * ligne dans `triggers.crons` de `wrangler.jsonc` et sa constante recopiée
 * dans `container/worker.ts` — un réglage Cloudflare, laissé à qui déploie.
 * Tant qu'il ne l'est pas, les dépôts abandonnés restent sous
 * `quality/pending/` ; rien d'autre ne casse.
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
    return { released };
  }
}
