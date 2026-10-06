import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../platform/auth/recompute.guard.js";
import { PurgeStaleGeocodesCommand } from "../application/commands/purge-stale-geocodes.command.js";

/** Le compte rendu du passage : un compte, jamais une empreinte ni une adresse. */
export interface GeocodePurgeSweepReport {
  readonly purged: number;
}

/**
 * Endpoint **batch** de la purge du cache du géocodage
 * (`documentation/legal/rgpd-purge-du-geocodage.md`). Même porte
 * machine-à-machine que `admin/livraison/journal/sweep` : le `RecomputeGuard`
 * et son jeton. Appelé par le cron nocturne `QUALITY_UPLOAD_SWEEP_CRON`
 * (`container/worker.ts`), juste après le journal de la livraison.
 */
@Controller("admin/livraison/geocodage/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class GeocodePurgeSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  async sweep(): Promise<GeocodePurgeSweepReport> {
    const purged = await this.commands.execute<PurgeStaleGeocodesCommand, number>(
      new PurgeStaleGeocodesCommand(),
    );
    return { purged };
  }
}
