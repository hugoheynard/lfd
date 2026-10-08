import type { IssuedInvoiceView, IssuedInvoicesView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import {
  GetMyCompanyInvoiceQuery,
  ListMyCompanyInvoicesQuery,
} from "../application/queries/issued-invoice-queries.js";

/**
 * Surface **client** de « Mes factures » (plan `plan-emission-de-la-facture.md`,
 * E6) — la section de `/mon-compte`. Le mur (détenteur ou facturation ;
 * non-membre 404, autre rôle 403) vit dans les handlers.
 */
@Controller("companies")
export class CompanyInvoicesController {
  constructor(private readonly queries: QueryBus) {}

  @Get(":companyId/invoices")
  list(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
  ): Promise<IssuedInvoicesView> {
    return this.queries.execute<ListMyCompanyInvoicesQuery, IssuedInvoicesView>(
      new ListMyCompanyInvoicesQuery(user.userId, companyId),
    );
  }

  @Get(":companyId/invoices/:invoiceId")
  read(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("invoiceId") invoiceId: string,
  ): Promise<IssuedInvoiceView> {
    return this.queries.execute<GetMyCompanyInvoiceQuery, IssuedInvoiceView>(
      new GetMyCompanyInvoiceQuery(user.userId, companyId, invoiceId),
    );
  }
}
