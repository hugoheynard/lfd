import type { IssuedInvoicesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { InvoiceReader } from "../../domain/ports/invoice.reader.js";
import { UnpaidAccessReader } from "../../domain/ports/unpaid-access.reader.js";
import { ensureInvoiceAccess } from "../../domain/services/invoice-access.js";
import { issuedInvoicesOf } from "../issued-invoice-view-support.js";
import { ListMyCompanyInvoicesQuery } from "./issued-invoice-queries.js";

/**
 * « Mes factures » (E6) : les pièces adressées à la société déclarée, pour
 * son détenteur et son rôle facturation (non-membre 404, autre rôle 403).
 */
@QueryHandler(ListMyCompanyInvoicesQuery)
export class ListMyCompanyInvoicesHandler implements IQueryHandler<
  ListMyCompanyInvoicesQuery,
  IssuedInvoicesView
> {
  constructor(
    private readonly access: UnpaidAccessReader,
    private readonly invoices: InvoiceReader,
    private readonly periods: InvoicePeriodsReader,
  ) {}

  async execute(query: ListMyCompanyInvoicesQuery): Promise<IssuedInvoicesView> {
    ensureInvoiceAccess(
      await this.access.roleOf(query.actorUserId, query.companyId),
      query.companyId,
    );
    return issuedInvoicesOf({ invoices: this.invoices, periods: this.periods }, query.companyId);
  }
}
