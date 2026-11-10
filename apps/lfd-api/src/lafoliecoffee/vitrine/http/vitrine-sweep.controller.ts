import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  SweepVitrineCommand,
  type VitrineSweepReport,
} from "../application/commands/sweep-vitrine.command.js";

/**
 * Endpoint **batch** du webhook de la vitrine (plan vitrine, W3′) : la même
 * porte machine-à-machine que `admin/outbox/sweep` — le `RecomputeGuard` et
 * son jeton, présentés par le Worker sur le cron de rafraîchissement
 * (`container/worker.ts`). L'agence est donc prévenue en cinq minutes au plus.
 */
@Controller("admin/vitrine/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class VitrineSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  sweep(): Promise<VitrineSweepReport> {
    return this.commands.execute<SweepVitrineCommand, VitrineSweepReport>(
      new SweepVitrineCommand(),
    );
  }
}
