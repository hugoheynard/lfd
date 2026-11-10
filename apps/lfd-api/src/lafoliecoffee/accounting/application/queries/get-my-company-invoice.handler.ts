import type { IssuedInvoiceView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { InvoiceNotFoundError } from "../../domain/errors/invoice-access-errors.js";
import { CompanyInvoicesReader } from "../../domain/ports/company-invoices.reader.js";
import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { UnpaidAccessReader } from "../../domain/ports/unpaid-access.reader.js";
import { ensureInvoiceAccess } from "../../domain/services/invoice-access.js";
import { invoiceViewOf } from "../issued-invoice-view-support.js";
import { GetMyCompanyInvoiceQuery } from "./issued-invoice-queries.js";

/**
 * Une facture de « Mes factures » (E6) : le mur de la liste, puis la pièce
 * doit être adressée à cette société ou couvrir un de ses bons — sinon le
 * même 404 qu'une pièce absente.
 */
@QueryHandler(GetMyCompanyInvoiceQuery)
export class GetMyCompanyInvoiceHandler implements IQueryHandler<
  GetMyCompanyInvoiceQuery,
  IssuedInvoiceView
> {
  constructor(
    private readonly access: UnpaidAccessReader,
    private readonly invoices: CompanyInvoicesReader,
    private readonly periods: InvoicePeriodsReader,
  ) {}

  async execute(query: GetMyCompanyInvoiceQuery): Promise<IssuedInvoiceView> {
    ensureInvoiceAccess(
      await this.access.roleOf(query.actorUserId, query.companyId),
      query.companyId,
    );
    const invoice = await this.invoices.oneVisibleTo(query.invoiceId, query.companyId);
    if (invoice === null) {
      throw new InvoiceNotFoundError(query.invoiceId);
    }
    return invoiceViewOf(this.periods, invoice);
  }
}
