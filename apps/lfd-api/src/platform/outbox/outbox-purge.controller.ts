import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../auth/public.decorator.js";
import { RecomputeGuard } from "../auth/recompute.guard.js";
import type { PurgeReport } from "../retention/purge-mode.js";
import { PurgeDeliveredOutboxCommand } from "./purge-delivered-outbox.command.js";

/**
 * Endpoint **batch** de la purge de la boîte d'envoi (`plan-service-e-mails.md`,
 * § 7). Même porte machine-à-machine que `admin/outbox/sweep` : le
 * `RecomputeGuard` et son jeton. Appelé par le cron nocturne
 * `QUALITY_UPLOAD_SWEEP_CRON` (`container/worker.ts`), avec les autres purges.
 * Le compte rendu dit le mode : en `dry-run` (défaut), rien n'est supprimé.
 */
@Controller("admin/outbox/purge")
@Public()
@UseGuards(RecomputeGuard)
export class OutboxPurgeController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  purge(): Promise<PurgeReport> {
    return this.commands.execute<PurgeDeliveredOutboxCommand, PurgeReport>(
      new PurgeDeliveredOutboxCommand(),
    );
  }
}
