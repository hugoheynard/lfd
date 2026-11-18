import type { IssuedInvoicesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { InvoiceReader } from "../../domain/ports/invoice.reader.js";
import { issuedInvoicesOf } from "../issued-invoice-view-support.js";
import { ListCompanyInvoicesQuery } from "./issued-invoice-queries.js";
import { ChorusDepositStandingsReader } from "../../domain/ports/chorus-deposit-standings.reader.js";

/** Les factures et avoirs d'une société, pour l'onglet « Facturation » de sa fiche (E6). */
@QueryHandler(ListCompanyInvoicesQuery)
export class ListCompanyInvoicesHandler implements IQueryHandler<
  ListCompanyInvoicesQuery,
  IssuedInvoicesView
> {
  constructor(
    private readonly invoices: InvoiceReader,
    private readonly periods: InvoicePeriodsReader,
    private readonly chorus: ChorusDepositStandingsReader,
  ) {}

  execute(query: ListCompanyInvoicesQuery): Promise<IssuedInvoicesView> {
    return issuedInvoicesOf(
      { invoices: this.invoices, periods: this.periods, chorus: this.chorus },
      query.companyId,
    );
  }
}
