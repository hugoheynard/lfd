import type { IssuedInvoiceView, IssuedInvoicesView } from "@lfd/contracts";
import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import type { InvoiceDocument } from "../application/invoice-document-support.js";
import {
  GetMyCompanyInvoiceDocumentQuery,
  GetMyCompanyInvoiceQuery,
  ListMyCompanyInvoicesQuery,
} from "../application/queries/issued-invoice-queries.js";
import { invoicePdfResponse } from "./invoice-pdf-response.js";

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

  /**
   * Le PDF/A-3 Factur-X rangé (E3b), en téléchargement : 404 nommé tant que
   * le rendu n'est pas fait. `attachment` toujours — une facture se garde.
   */
  @Get(":companyId/invoices/:invoiceId/pdf")
  async document(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Param("invoiceId") invoiceId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const document = await this.queries.execute<GetMyCompanyInvoiceDocumentQuery, InvoiceDocument>(
      new GetMyCompanyInvoiceDocumentQuery(user.userId, companyId, invoiceId),
    );
    return invoicePdfResponse(document, response);
  }
}
