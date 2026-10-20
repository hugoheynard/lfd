import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { GetAtelierSheetSpecimenQuery } from "../application/queries/get-atelier-sheet-specimen.query.js";
import type { ProductionPaper } from "../application/services/production-paper.service.js";

/**
 * **La fiche d'atelier d'EXEMPLE** — la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 Sous `b2b_accounting` et NON `production_plan` : la planche est un écran
 * de la Comptabilité, ouvert par un seul droit, et chaque bloc y sert ses
 * exemplaires sous le même préfixe parce que le commerce ne lit pas le fournil.
 * Le nom de la ressource n'est qu'une valeur de `@lfd/contracts` : aucun
 * import du commerce. Il n'injecte que le `QueryBus`.
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminAtelierSheetSpecimenController {
  constructor(private readonly queries: QueryBus) {}

  @Get("atelier-sheet.pdf")
  async atelierSheet(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetAtelierSheetSpecimenQuery, ProductionPaper>(
      new GetAtelierSheetSpecimenQuery(),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "exemple-fiche-atelier.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
