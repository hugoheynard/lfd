import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import { PruneOrderDayChangesCommand } from "../application/commands/prune-order-day-changes.command.js";
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
 *
 * **La même passe balaie le journal des journées du commerce**
 * (`documentation/caching-usage/plan-version-par-journee.md`, D2) : c'est la
 * passe machine du contexte qui possède `orders`, et un cron de plus serait un
 * réglage Cloudflare pour une suppression de quelques centaines de lignes.
 * Deux commandes, deux handlers — seule la porte est partagée. Le compte
 * rendu reste celui du rappel : sa forme est lue telle quelle, et un balayage
 * de numéros d'affichage n'a rien à y annoncer.
 */
@Controller("admin/orders/settlement-reminders")
@Public()
@UseGuards(RecomputeGuard)
export class SettlementRemindersController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  async remind(): Promise<SettlementRemindersReport> {
    const report = await this.commands.execute<
      SendSettlementRemindersCommand,
      SettlementRemindersReport
    >(new SendSettlementRemindersCommand());
    await this.commands.execute<PruneOrderDayChangesCommand, number>(
      new PruneOrderDayChangesCommand(),
    );
    return report;
  }
}
