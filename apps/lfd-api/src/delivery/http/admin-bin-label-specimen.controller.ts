import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import type { BinLabelsFile } from "../application/bin-labels-print.js";
import { GetBinLabelSpecimenQuery } from "../application/queries/get-bin-label-specimen.query.js";

/**
 * **L'étiquette de bac d'EXEMPLE** — la planche des documents de la
 * Comptabilité. Sous `b2b_accounting`, pour la raison de la feuille de tournée
 * d'exemple (`admin-round-paper-specimen.controller.ts`). Il n'injecte que le
 * `QueryBus`.
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminBinLabelSpecimenController {
  constructor(private readonly queries: QueryBus) {}

  @Get("bin-label.pdf")
  async binLabel(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetBinLabelSpecimenQuery, BinLabelsFile>(
      new GetBinLabelSpecimenQuery(),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "exemple-etiquette-de-bac.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
