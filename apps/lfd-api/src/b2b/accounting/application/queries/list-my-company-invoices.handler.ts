import type { MyIssuedInvoicesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CompanyInvoicesReader } from "../../domain/ports/company-invoices.reader.js";
import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { InvoiceSettlementFactsReader } from "../../domain/ports/invoice-settlement-facts.reader.js";
import { UnpaidAccessReader } from "../../domain/ports/unpaid-access.reader.js";
import { ensureInvoiceAccess } from "../../domain/services/invoice-access.js";
import { myInvoicesViewOf } from "../my-invoices-view-support.js";
import { ListMyCompanyInvoicesQuery } from "./issued-invoice-queries.js";

/**
 * « Mes factures » (E6, puis la page — plan `plan-page-mes-factures.md`) :
 * les pièces adressées à la société déclarée, et celles qui couvrent un de
 * ses bons (un site voit la facture de sa maison mère, suite (a)), chacune
 * avec son règlement, et le total dû du compte. Pour son détenteur et son
 * rôle facturation (non-membre 404, autre rôle 403).
 */
@QueryHandler(ListMyCompanyInvoicesQuery)
export class ListMyCompanyInvoicesHandler implements IQueryHandler<
  ListMyCompanyInvoicesQuery,
  MyIssuedInvoicesView
> {
  constructor(
    private readonly access: UnpaidAccessReader,
    private readonly invoices: CompanyInvoicesReader,
    private readonly periods: InvoicePeriodsReader,
    private readonly settlements: InvoiceSettlementFactsReader,
  ) {}

  async execute(query: ListMyCompanyInvoicesQuery): Promise<MyIssuedInvoicesView> {
    ensureInvoiceAccess(
      await this.access.roleOf(query.actorUserId, query.companyId),
      query.companyId,
    );
    return myInvoicesViewOf(
      { periods: this.periods, settlements: this.settlements },
      await this.invoices.visibleTo(query.companyId),
      query.filter,
    );
  }
}
