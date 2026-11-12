import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../platform/auth/recompute.guard.js";
import {
  type FirstPaymentsReplayReport,
  ReplayFirstPaymentsCommand,
} from "../application/commands/replay-first-payments.command.js";
import { Idempotent } from "../../platform/shared/http/idempotent.decorator.js";

/**
 * Endpoint **batch** du rattrapage des premiers paiements (plan M2, §4.3,
 * §6.8 : `replay-first-payments`, de P0 à P2) — la même porte
 * machine-à-machine que `admin/outbox/sweep` : le `RecomputeGuard` et son
 * jeton, présentés par le cron HORAIRE du Worker (`container/worker.ts`,
 * branché au lot P0.c2 avec le module).
 */
@Controller("admin/card-payments/first-payments/replay")
@Public()
@UseGuards(RecomputeGuard)
export class ReplayFirstPaymentsController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  @Idempotent(
    "appelée par la machine (RecomputeGuard) : chaque référence est relue sous claim et la ligne insérée absente ou avancée en retard, jamais en arrière ; rejoué, le rattrapage ne trouve plus rien à insérer ni à avancer",
  )
  replay(): Promise<FirstPaymentsReplayReport> {
    return this.commands.execute<ReplayFirstPaymentsCommand, FirstPaymentsReplayReport>(
      new ReplayFirstPaymentsCommand(),
    );
  }
}
