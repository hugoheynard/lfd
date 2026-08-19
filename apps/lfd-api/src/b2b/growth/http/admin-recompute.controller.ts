import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { RecomputeLeadScoresCommand } from "../application/commands/recompute-lead-scores.command.js";

/**
 * Endpoint **batch** du cockpit : recalcule le read-model `lead_score`. Déclenché
 * par le **Cloudflare Cron Trigger** 3×/jour aux heures creuses — jamais temps réel.
 *
 * `@Public()` désarme le guard client global ; `RecomputeGuard` réarme la porte
 * machine-à-machine (jeton interne, ou bypass de dev). Retourne le nombre de leads
 * scorés — observabilité du cron dans les logs du Worker.
 */
@Controller("admin/recompute")
@Public()
@UseGuards(RecomputeGuard)
export class AdminRecomputeController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  async recompute(): Promise<{ recomputed: number }> {
    const recomputed = await this.commands.execute<RecomputeLeadScoresCommand, number>(
      new RecomputeLeadScoresCommand(),
    );
    return { recomputed };
  }
}
