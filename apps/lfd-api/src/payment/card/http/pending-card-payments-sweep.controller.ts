import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import {
  type PendingCardPaymentsSweepReport,
  SweepPendingCardPaymentsCommand,
} from "../application/commands/sweep-pending-card-payments.command.js";

/**
 * Endpoint **batch** du balayage des paiements en attente (plan B, §2.4) —
 * la porte machine-à-machine des autres balayages du bloc : le
 * `RecomputeGuard` et son jeton, présentés par le cron de RAFRAÎCHISSEMENT du
 * Worker (`container/worker.ts`, toutes les cinq minutes).
 */
@Controller("admin/card-payments/pending/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class PendingCardPaymentsSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  @Idempotent(
    "appelée par la machine (RecomputeGuard) : chaque paiement est réglé par la machine de sa ligne, relue sous verrou après le sujet — deux passages simultanés relisent deux fois le prestataire, ne règlent jamais deux fois",
  )
  sweep(): Promise<PendingCardPaymentsSweepReport> {
    return this.commands.execute<SweepPendingCardPaymentsCommand, PendingCardPaymentsSweepReport>(
      new SweepPendingCardPaymentsCommand(),
    );
  }
}
