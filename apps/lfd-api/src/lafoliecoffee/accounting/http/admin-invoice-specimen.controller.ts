import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { GetInvoiceSpecimenQuery } from "../application/queries/get-invoice-specimen.query.js";
import { GetPeriodQuoteSpecimenQuery } from "../application/queries/get-period-quote-specimen.query.js";
import type { InvoiceDocument } from "../application/invoice-document-support.js";

/**
 * **La facture d'EXEMPLE** — la planche des documents de la Comptabilité
 * (`documentation/comptabilite/planche-des-documents.md`), sous
 * `b2b_accounting` en lecture comme les autres exemplaires de la planche.
 *
 * Une route par moyen qui change le papier : sans moyen figé, et au virement
 * (le bloc « Règlement par virement »). La facture EST le PDF/A-3 Factur-X,
 * il n'existe pas de second rendu « simple ». Le devis de période d'exemple
 * (un PDF ordinaire, sans Factur-X) y a sa route. Il n'injecte que le
 * `QueryBus`.
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminInvoiceSpecimenController {
  constructor(private readonly queries: QueryBus) {}

  @Get("invoice.pdf")
  invoice(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.serve(new GetInvoiceSpecimenQuery(), response);
  }

  @Get("invoice-bank-transfer.pdf")
  bankTransferInvoice(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.serve(new GetInvoiceSpecimenQuery("bank_transfer"), response);
  }

  @Get("period-quote.pdf")
  periodQuote(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.serve(new GetPeriodQuoteSpecimenQuery(), response);
  }

  private async serve(
    query: GetInvoiceSpecimenQuery | GetPeriodQuoteSpecimenQuery,
    response: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.queries.execute<
      GetInvoiceSpecimenQuery | GetPeriodQuoteSpecimenQuery,
      InvoiceDocument
    >(query);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "exemple-facture.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
