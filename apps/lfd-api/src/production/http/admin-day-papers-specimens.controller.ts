import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { GetDayDossierSpecimenQuery } from "../application/queries/get-day-dossier-specimen.query.js";
import { GetProductionCountSpecimenQuery } from "../application/queries/get-production-count-specimen.query.js";
import type { ProductionPaper } from "../application/services/production-paper.service.js";

/**
 * **Le compte à produire et le dossier du jour d'EXEMPLE** — la planche des
 * documents de la Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 Sous `b2b_accounting`, comme la fiche d'atelier d'exemple : la planche
 * s'ouvre par un seul droit. Il n'injecte que le `QueryBus`.
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminDayPapersSpecimensController {
  constructor(private readonly queries: QueryBus) {}

  @Get("production-count.pdf")
  async productionCount(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetProductionCountSpecimenQuery, ProductionPaper>(
      new GetProductionCountSpecimenQuery(),
    );
    return served(response, pdf, "exemple-compte-a-produire.pdf");
  }

  @Get("day-dossier.pdf")
  async dayDossier(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetDayDossierSpecimenQuery, ProductionPaper>(
      new GetDayDossierSpecimenQuery(),
    );
    return served(response, pdf, "exemple-dossier-du-jour.pdf");
  }
}

function served(response: Response, pdf: ProductionPaper, fallback: string): StreamableFile {
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader(
    "Content-Disposition",
    contentDispositionInline(sanitiseFileName(pdf.fileName, fallback)),
  );
  return new StreamableFile(pdf.bytes);
}
