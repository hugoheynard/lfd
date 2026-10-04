import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../auth/public.decorator.js";
import { RecomputeGuard } from "../auth/recompute.guard.js";
import type { OutboxSweepReport } from "./outbox-relay.js";
import { SweepOutboxCommand } from "./sweep-outbox.command.js";

/**
 * Endpoint **batch** de la boîte d'envoi (plan §7, B3). Même porte
 * machine-à-machine que `admin/loyalty/sweep` : le `RecomputeGuard` et son
 * jeton, présentés par le Worker.
 *
 * Appelé par le cron `*\/5` de rafraîchissement (`KEEP_WARM_CRON`,
 * `container/worker.ts`) : c'est lui qui réveille l'instance, et un fait
 * laissé par un processus mort attend donc cinq minutes au plus.
 */
@Controller("admin/outbox/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class OutboxSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  sweep(): Promise<OutboxSweepReport> {
    return this.commands.execute<SweepOutboxCommand, OutboxSweepReport>(new SweepOutboxCommand());
  }
}
