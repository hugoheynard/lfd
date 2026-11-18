import type { OrderInvoicesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { OrderInvoicesReader } from "../../domain/ports/order-invoices.reader.js";
import { orderInvoicesOf } from "../issued-invoice-view-support.js";
import { ListOrderInvoicesQuery } from "./card-invoice-queries.js";
import { ChorusDepositStandingsReader } from "../../domain/ports/chorus-deposit-standings.reader.js";

/** La facture et les avoirs d'une commande (lot E5c). */
@QueryHandler(ListOrderInvoicesQuery)
export class ListOrderInvoicesHandler implements IQueryHandler<
  ListOrderInvoicesQuery,
  OrderInvoicesView
> {
  constructor(
    private readonly invoices: OrderInvoicesReader,
    private readonly periods: InvoicePeriodsReader,
    private readonly chorus: ChorusDepositStandingsReader,
  ) {}

  execute(query: ListOrderInvoicesQuery): Promise<OrderInvoicesView> {
    return orderInvoicesOf(
      { invoices: this.invoices, periods: this.periods, chorus: this.chorus },
      query.orderId,
    );
  }
}
