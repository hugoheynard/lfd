import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  SendSettlementRemindersCommand,
  type SettlementRemindersReport,
} from "../application/commands/send-settlement-reminders.command.js";

/**
 * Endpoint **batch** du rappel de règlement (plan
 * `documentation/order/plan-abandon-du-reglement.md`, Q6, S5) : prévient le
 * commercial des liens de paiement non réglés à l'heure limite.
 *
 * Même porte machine-à-machine que `admin/loyalty/sweep` — le `RecomputeGuard`
 * et son jeton, présentés par le Worker sur un Cron Trigger horaire
 * (`SETTLEMENT_REMINDERS_CRON`, `container/worker.ts`).
 */
@Controller("admin/orders/settlement-reminders")
@Public()
@UseGuards(RecomputeGuard)
export class SettlementRemindersController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  remind(): Promise<SettlementRemindersReport> {
    return this.commands.execute<SendSettlementRemindersCommand, SettlementRemindersReport>(
      new SendSettlementRemindersCommand(),
    );
  }
}
