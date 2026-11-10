import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import type { CompanyOrderSummaryPdfFile } from "../application/queries/export-company-order-summary-pdf.handler.js";
import { GetOrderSummarySpecimenQuery } from "../application/queries/get-order-summary-specimen.query.js";

/**
 * **Le récapitulatif de commandes d'EXEMPLE** — la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`), sous
 * `b2b_accounting` en lecture comme les autres exemplaires de la planche. Il
 * n'injecte que le `QueryBus`.
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminOrderSummarySpecimenController {
  constructor(private readonly queries: QueryBus) {}

  @Get("order-summary.pdf")
  async summary(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const pdf = await this.queries.execute<
      GetOrderSummarySpecimenQuery,
      CompanyOrderSummaryPdfFile
    >(new GetOrderSummarySpecimenQuery());
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(
        sanitiseFileName(pdf.fileName, "exemple-recapitulatif-de-commandes.pdf"),
      ),
    );
    return new StreamableFile(pdf.bytes);
  }
}
