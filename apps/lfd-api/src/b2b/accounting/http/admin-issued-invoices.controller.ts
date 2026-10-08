import type { IssuedInvoiceView, IssuedInvoicesView } from "@lfd/contracts";
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ResendInvoiceNoticeCommand } from "../application/commands/resend-invoice-notice.command.js";
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
 * Lectures sous `b2b_accounting:read` ; le renvoi de l'e-mail « Votre
 * facture » (E6, suite (b)) sous `b2b_accounting:write`, déduit du verbe.
 */
@Controller("admin")
@AdminSurface("b2b_accounting")
export class AdminIssuedInvoicesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Renvoie « Votre facture » aux destinataires d'aujourd'hui ; 409 nommé si rien n'est parti. */
  @Post("accounting/invoices/:invoiceId/resend-notice")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendNotice(@Param("invoiceId") invoiceId: string): Promise<void> {
    await this.commands.execute<ResendInvoiceNoticeCommand, void>(
      new ResendInvoiceNoticeCommand(invoiceId),
    );
  }

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
