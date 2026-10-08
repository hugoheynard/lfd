import type {
  CardInvoiceRetryView,
  CardInvoiceSignalsView,
  OrderInvoicesView,
} from "@lfd/contracts";
import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { IssueCardInvoiceCommand } from "../application/commands/issue-card-invoice.command.js";
import {
  GetCardInvoiceSignalsQuery,
  ListOrderInvoicesQuery,
} from "../application/queries/card-invoice-queries.js";

/**
 * Surface **staff** de la facture carte (plan
 * `plan-facture-carte-et-remboursements.md`, lots E5a et E5c) : les factures
 * signalées et « Réessayer » (`b2b_accounting:write`), et les pièces d'une
 * commande pour sa fiche.
 */
@Controller("admin/accounting")
@AdminSurface("b2b_accounting")
export class AdminCardInvoicesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get("card-invoices/signals")
  signals(): Promise<CardInvoiceSignalsView> {
    return this.queries.execute<GetCardInvoiceSignalsQuery, CardInvoiceSignalsView>(
      new GetCardInvoiceSignalsQuery(),
    );
  }

  /** « Réessayer » : la même commande que les abonnés — sans effet si elle est déjà émise. */
  @Post("card-invoices/:orderId/retry")
  @HttpCode(200)
  retry(@Param("orderId") orderId: string): Promise<CardInvoiceRetryView> {
    return this.commands.execute<IssueCardInvoiceCommand, CardInvoiceRetryView>(
      new IssueCardInvoiceCommand(orderId),
    );
  }

  @Get("orders/:orderId/invoices")
  orderInvoices(@Param("orderId") orderId: string): Promise<OrderInvoicesView> {
    return this.queries.execute<ListOrderInvoicesQuery, OrderInvoicesView>(
      new ListOrderInvoicesQuery(orderId),
    );
  }
}
