import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../auth/public.decorator.js";
import { RecomputeGuard } from "../auth/recompute.guard.js";
import type { PurgeReport } from "../retention/purge-mode.js";
import { Idempotent } from "../shared/http/idempotent.decorator.js";
import { PurgeGestureIntentsCommand } from "./purge-gesture-intents.command.js";

/**
 * Endpoint **batch** de la purge des intentions des gestes. Même porte
 * machine-à-machine que `admin/outbox/purge` : le `RecomputeGuard` et son
 * jeton, appelé par le cron nocturne `QUALITY_UPLOAD_SWEEP_CRON`
 * (`container/worker.ts`) avec les autres purges. Une route à elle : la passe
 * du commerce n'a pas à porter une plomberie de `platform`.
 */
@Controller("admin/intents/purge")
@Public()
@UseGuards(RecomputeGuard)
export class GestureIntentPurgeController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @Idempotent(
    "appelée par la machine (RecomputeGuard) : ne retire que des intentions réclamées depuis plus de 7 jours ; rejouée, elle ne trouve plus rien d'échu",
  )
  @HttpCode(200)
  purge(): Promise<PurgeReport> {
    return this.commands.execute<PurgeGestureIntentsCommand, PurgeReport>(
      new PurgeGestureIntentsCommand(),
    );
  }
}
