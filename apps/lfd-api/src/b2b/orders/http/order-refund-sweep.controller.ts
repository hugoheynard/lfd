import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  SweepOrderRefundsCommand,
  type OrderRefundSweepReport,
} from "../application/commands/sweep-order-refunds.command.js";

/**
 * Endpoint **batch** des remboursements dus (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C4.7 (b)). Même porte
 * machine-à-machine que `admin/outbox/sweep` : le `RecomputeGuard` et son
 * jeton, présentés par le Worker sur le cron de rafraîchissement
 * (`container/worker.ts`). Idempotent : le bail exclut deux exécuteurs.
 */
@Controller("admin/orders/refunds/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class OrderRefundSweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  sweep(): Promise<OrderRefundSweepReport> {
    return this.commands.execute<SweepOrderRefundsCommand, OrderRefundSweepReport>(
      new SweepOrderRefundsCommand(),
    );
  }
}
