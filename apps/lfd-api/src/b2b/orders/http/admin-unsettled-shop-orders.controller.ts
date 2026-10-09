import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  ExpireUnsettledShopOrdersCommand,
  type UnsettledShopOrderExpiryReport,
} from "../application/commands/expire-unsettled-shop-orders.command.js";

/**
 * Endpoint **machine** de l'expiration des commandes boutique non réglées (plan
 * `documentation/order/plan-commandes-non-reglees.md`, §4.5) : présenté par le
 * Worker sur son cron de RAFRAÎCHISSEMENT (`KEEP_WARM_CRON`, `*\/5 * * * *`,
 * `container/worker.ts`), avec le jeton du `RecomputeGuard` — la même porte que
 * l'autopilot de la facture du mois.
 *
 * Délai de 30 minutes, passage toutes les cinq : une commande non réglée est
 * annulée **au plus 35 minutes** après sa passation.
 */
@Controller("admin/orders/unsettled-shop-orders/expire")
@Public()
@UseGuards(RecomputeGuard)
export class UnsettledShopOrdersController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  expire(): Promise<UnsettledShopOrderExpiryReport> {
    return this.commands.execute<ExpireUnsettledShopOrdersCommand, UnsettledShopOrderExpiryReport>(
      new ExpireUnsettledShopOrdersCommand(),
    );
  }
}
