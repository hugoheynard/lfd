import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../platform/auth/recompute.guard.js";
import { PruneDeliveryDayChangesCommand } from "../application/commands/prune-delivery-day-changes.command.js";

/** Le compte rendu du passage : la seule observabilité d'un déclenchement machine. */
export interface DeliveryDayChangeSweepReport {
  readonly pruned: number;
}

/**
 * Endpoint **batch** du balayage du journal des journées de la livraison
 * (`plan-schema-delivery.md`, SD-D3). Même porte machine-à-machine que
 * `admin/production/quality/sweep` : le `RecomputeGuard` et son jeton.
 *
 * Appelé par le MÊME cron nocturne que le balayage du fournil
 * (`QUALITY_UPLOAD_SWEEP_CRON`, `container/worker.ts`), juste après lui : pas
 * de réglage Cloudflare de plus. Une route à part, parce que le fournil ne
 * connaît pas la livraison — ni son code, ni son journal.
 */
@Controller("admin/livraison/journal/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class DeliveryDayChangeSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  async sweep(): Promise<DeliveryDayChangeSweepReport> {
    const pruned = await this.commands.execute<PruneDeliveryDayChangesCommand, number>(
      new PruneDeliveryDayChangesCommand(),
    );
    return { pruned };
  }
}
