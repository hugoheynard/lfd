import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import type { InHouseRecapPdf } from "../application/queries/get-in-house-recap-document.handler.js";
import { GetInHouseRecapSpecimenQuery } from "../application/queries/get-in-house-recap-specimen.query.js";

/**
 * **Le récapitulatif des BL d'EXEMPLE** — la planche des documents
 * (`documentation/comptabilite/planche-des-documents.md`), sous
 * `b2b_accounting` en lecture comme ses voisins.
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminInHouseRecapSpecimenController {
  constructor(private readonly queries: QueryBus) {}

  @Get("in-house-recap.pdf")
  async recap(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetInHouseRecapSpecimenQuery, InHouseRecapPdf>(
      new GetInHouseRecapSpecimenQuery(),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "exemple-recapitulatif.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
