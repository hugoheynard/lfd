import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  ExpireUnsettledShopOrdersCommand,
  type UnsettledShopOrderExpiryReport,
} from "../application/commands/expire-unsettled-shop-orders.command.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * Endpoint **machine** de l'expiration des commandes boutique non réglées (plan
 * `documentation/commandes/reglement/commande-carte-reglee.md`, §4.5) : présenté par le
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
  @Idempotent(
    "appelée par la machine sous RecomputeGuard : état relu ; rejouée, une commande déjà annulée n'est plus listée, l'annulation est conditionnée en base (canceller rend faux) et l'intention Stripe se rannule en already_cancelled",
  )
  expire(): Promise<UnsettledShopOrderExpiryReport> {
    return this.commands.execute<ExpireUnsettledShopOrdersCommand, UnsettledShopOrderExpiryReport>(
      new ExpireUnsettledShopOrdersCommand(),
    );
  }
}
