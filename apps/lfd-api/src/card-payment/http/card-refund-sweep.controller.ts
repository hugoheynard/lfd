import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../platform/auth/recompute.guard.js";
import {
  type CardRefundSweepReport,
  SweepCardRefundsCommand,
} from "../application/commands/sweep-card-refunds.command.js";
import { Idempotent } from "../../platform/shared/http/idempotent.decorator.js";

/**
 * Endpoint **batch** des remboursements par carte dus (plan M2, §6.8 :
 * `sweep-card-refunds`) — la même porte machine-à-machine que
 * `admin/card-payments/first-payments/replay` : le `RecomputeGuard` et son
 * jeton, présentés par le cron de RAFRAÎCHISSEMENT du Worker
 * (`container/worker.ts`, toutes les cinq minutes). Idempotent : le bail
 * exclut deux exécuteurs. L'ancienne route `admin/orders/refunds/sweep` est
 * retirée au lot P1.c, avec l'exécuteur d'`orders` qu'elle reprenait.
 */
@Controller("admin/card-payments/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class CardRefundSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  @Idempotent(
    "appelée par la machine (RecomputeGuard) : le bail de chaque demande exclut deux exécuteurs, et chaque émission porte la clé de la demande chez le prestataire (génération, tour) — un second passage ne rembourse pas deux fois",
  )
  sweep(): Promise<CardRefundSweepReport> {
    return this.commands.execute<SweepCardRefundsCommand, CardRefundSweepReport>(
      new SweepCardRefundsCommand(),
    );
  }
}
