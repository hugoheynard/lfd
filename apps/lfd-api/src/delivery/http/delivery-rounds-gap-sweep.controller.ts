import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../platform/auth/recompute.guard.js";
import {
  RingRoundsGapBellCommand,
  type RoundsGapBellReport,
} from "../application/commands/ring-rounds-gap-bell.command.js";

/**
 * Endpoint **machine** de la cloche « hors tournée »
 * (`documentation/livraisons/tournees/composition-automatique.md`, §5). Même porte que
 * `admin/production/auto-close` : le `RecomputeGuard` et son jeton.
 *
 * Appelé par le cron de RAFRAÎCHISSEMENT (`*\/5`, `refreshSweeps` dans
 * `container/worker.ts`), à côté du tour de l'arrêt du plan : au plus cinq
 * minutes de retard sur 16 h, aucun réglage Cloudflare de plus. Idempotent.
 */
@Controller("admin/livraison/hors-tournee/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class DeliveryRoundsGapSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  sweep(): Promise<RoundsGapBellReport> {
    return this.commands.execute<RingRoundsGapBellCommand, RoundsGapBellReport>(
      new RingRoundsGapBellCommand(),
    );
  }
}
