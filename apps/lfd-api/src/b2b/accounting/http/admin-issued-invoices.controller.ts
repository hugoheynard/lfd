import type { IssuedInvoiceView, IssuedInvoicesView } from "@lfd/contracts";
import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import type { InvoiceDocument } from "../application/invoice-document-support.js";
import {
  GetIssuedInvoiceDocumentQuery,
  GetIssuedInvoiceQuery,
  ListCompanyInvoicesQuery,
} from "../application/queries/issued-invoice-queries.js";
import { invoicePdfResponse } from "./invoice-pdf-response.js";

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

  /** Le PDF/A-3 Factur-X rangé (E3b) : 404 nommé tant que le rendu n'est pas fait. */
  @Get("accounting/invoices/:invoiceId/pdf")
  async document(
    @Param("invoiceId") invoiceId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const document = await this.queries.execute<GetIssuedInvoiceDocumentQuery, InvoiceDocument>(
      new GetIssuedInvoiceDocumentQuery(invoiceId),
    );
    return invoicePdfResponse(document, response);
  }
}
