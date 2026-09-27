import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  CreditPendingOrderPointsCommand,
  type PendingOrderPointsReport,
} from "../application/commands/credit-pending-order-points.command.js";
import { ExpireLoyaltyVouchersCommand } from "../application/commands/expire-loyalty-vouchers.command.js";
import {
  SettleVoucherRemaindersCommand,
  type VoucherRemaindersReport,
} from "../application/commands/settle-voucher-remainders.command.js";

/** Le compte rendu du passage : la seule observabilité d'un déclenchement machine. */
export interface LoyaltySweepReport extends PendingOrderPointsReport {
  readonly expired: number;
  /** Le rattrapage des bons engagés (lot C) — champ ajouté, le reste inchangé. */
  readonly vouchers: VoucherRemaindersReport;
}

/**
 * Endpoint **batch** de la fidélité (plan D3, D7) : le rattrapage des gains,
 * puis l'expiration des bons. Même porte machine-à-machine que
 * `admin/media/sweep` et `admin/recompute` — le `RecomputeGuard` et son jeton,
 * présentés par le Worker sur un Cron Trigger.
 *
 * Appelé chaque nuit à 02 h UTC : `0 2 * * *` dans `wrangler.jsonc`, et
 * `LOYALTY_SWEEP_CRON` dans `container/worker.ts` (vérifié le 2026-09-26). Il
 * rattrape les crédits que les abonnés ont manqués, puis écrit l'expiration
 * des bons échus — déjà inutilisables avant, parce qu'elle se lit à l'horloge.
 * Depuis le lot C, il solde enfin les reliquats des commandes payées et signale
 * les bons engagés sur une commande restée en suspens.
 */
@Controller("admin/loyalty/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class LoyaltySweepController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  async sweep(): Promise<LoyaltySweepReport> {
    const credits = await this.commands.execute<
      CreditPendingOrderPointsCommand,
      PendingOrderPointsReport
    >(new CreditPendingOrderPointsCommand());
    const expired = await this.commands.execute<ExpireLoyaltyVouchersCommand, number>(
      new ExpireLoyaltyVouchersCommand(),
    );
    const vouchers = await this.commands.execute<
      SettleVoucherRemaindersCommand,
      VoucherRemaindersReport
    >(new SettleVoucherRemaindersCommand());
    return { ...credits, expired, vouchers };
  }
}
