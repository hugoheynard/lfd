import type { IssuedInvoiceView, IssuedInvoicesView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  GetIssuedInvoiceQuery,
  ListCompanyInvoicesQuery,
} from "../application/queries/issued-invoice-queries.js";

/**
 * Surface **staff** des factures émises (E6) : la liste d'une société pour
 * l'onglet « Facturation » de sa fiche, et une pièce pour la comptabilité.
 * Lecture seule, `b2b_accounting:read`.
 */
@Controller("admin")
@AdminSurface("b2b_accounting")
export class AdminIssuedInvoicesController {
  constructor(private readonly queries: QueryBus) {}

  @Get("companies/:companyId/invoices")
  ofCompany(@Param("companyId") companyId: string): Promise<IssuedInvoicesView> {
    return this.queries.execute<ListCompanyInvoicesQuery, IssuedInvoicesView>(
      new ListCompanyInvoicesQuery(companyId),
    );
  }

  @Get("accounting/invoices/:invoiceId")
  read(@Param("invoiceId") invoiceId: string): Promise<IssuedInvoiceView> {
    return this.queries.execute<GetIssuedInvoiceQuery, IssuedInvoiceView>(
      new GetIssuedInvoiceQuery(invoiceId),
    );
  }
}
