import type { IssuedInvoiceView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { InvoiceReader } from "../../domain/ports/invoice.reader.js";
import { issuedInvoiceOf } from "../issued-invoice-view-support.js";
import { GetIssuedInvoiceQuery } from "./issued-invoice-queries.js";

/** Une pièce émise, dans la comptabilité du back-office (E6) — 404 si elle n'existe pas. */
@QueryHandler(GetIssuedInvoiceQuery)
export class GetIssuedInvoiceHandler implements IQueryHandler<
  GetIssuedInvoiceQuery,
  IssuedInvoiceView
> {
  constructor(
    private readonly invoices: InvoiceReader,
    private readonly periods: InvoicePeriodsReader,
  ) {}

  execute(query: GetIssuedInvoiceQuery): Promise<IssuedInvoiceView> {
    return issuedInvoiceOf(
      { invoices: this.invoices, periods: this.periods },
      query.invoiceId,
      null,
    );
  }
}
