import type { OrderAwaitingPaymentView } from "@lfd/contracts";
import { Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ResendOrderPaymentLinkCommand } from "../application/commands/resend-order-payment-link.command.js";
import { ListOrdersAwaitingPaymentQuery } from "../application/queries/list-orders-awaiting-payment.query.js";

/**
 * Surface **comptabilité** des commandes à régler par carte (plan liens de
 * paiement §2a). Elle vit dans `orders` parce que la commande y vit ; elle
 * déclare pourtant `b2b_accounting` — c'est la comptabilité qui relance un
 * règlement. Les liens libres (§2b) sont dans `payments`, sous le même préfixe.
 */
@Controller("admin/accounting/payment-links/orders")
@AdminSurface("b2b_accounting")
export class AdminOrderPaymentLinksController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  list(): Promise<readonly OrderAwaitingPaymentView[]> {
    return this.queries.execute<
      ListOrdersAwaitingPaymentQuery,
      readonly OrderAwaitingPaymentView[]
    >(new ListOrdersAwaitingPaymentQuery());
  }

  /** Renvoie le lien de règlement à l'acheteur, par e-mail. */
  @Post(":orderId/resend")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resend(
    @StaffUserId() staffUserId: string,
    @Param("orderId") orderId: string,
  ): Promise<void> {
    await this.commands.execute<ResendOrderPaymentLinkCommand, void>(
      new ResendOrderPaymentLinkCommand(orderId, staffUserId),
    );
  }
}
