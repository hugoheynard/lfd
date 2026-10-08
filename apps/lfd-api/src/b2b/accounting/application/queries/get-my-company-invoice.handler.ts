import type { IssuedInvoiceView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { InvoiceReader } from "../../domain/ports/invoice.reader.js";
import { UnpaidAccessReader } from "../../domain/ports/unpaid-access.reader.js";
import { ensureInvoiceAccess } from "../../domain/services/invoice-access.js";
import { issuedInvoiceOf } from "../issued-invoice-view-support.js";
import { GetMyCompanyInvoiceQuery } from "./issued-invoice-queries.js";

/**
 * Une facture de « Mes factures » (E6) : le mur de la liste, puis la pièce
 * doit être adressée à cette société — sinon le même 404 qu'une pièce
 * absente.
 */
@QueryHandler(GetMyCompanyInvoiceQuery)
export class GetMyCompanyInvoiceHandler implements IQueryHandler<
  GetMyCompanyInvoiceQuery,
  IssuedInvoiceView
> {
  constructor(
    private readonly access: UnpaidAccessReader,
    private readonly invoices: InvoiceReader,
    private readonly periods: InvoicePeriodsReader,
  ) {}

  async execute(query: GetMyCompanyInvoiceQuery): Promise<IssuedInvoiceView> {
    ensureInvoiceAccess(
      await this.access.roleOf(query.actorUserId, query.companyId),
      query.companyId,
    );
    return issuedInvoiceOf(
      { invoices: this.invoices, periods: this.periods },
      query.invoiceId,
      query.companyId,
    );
  }
}
