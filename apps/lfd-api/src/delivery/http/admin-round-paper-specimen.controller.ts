import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import type { RoundPaperFile } from "../application/queries/get-round-paper-pdf.handler.js";
import { GetDayRoundsDossierSpecimenQuery } from "../application/queries/get-day-rounds-dossier-specimen.query.js";
import { GetRoundPaperSpecimenQuery } from "../application/queries/get-round-paper-specimen.query.js";

/**
 * **La feuille de tournée d'EXEMPLE** — la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * 🔴 Sous `b2b_accounting` et NON `delivery_rounds` : la planche est un écran
 * de la Comptabilité, ouvert par un seul droit, et chaque bloc y sert ses
 * exemplaires sous le même préfixe parce que le commerce ne lit pas la
 * livraison. Le nom de la ressource n'est qu'une valeur de `@lfd/contracts` :
 * aucun import du commerce. Il n'injecte que le `QueryBus`.
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminRoundPaperSpecimenController {
  constructor(private readonly queries: QueryBus) {}

  @Get("round-paper.pdf")
  async roundPaper(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetRoundPaperSpecimenQuery, RoundPaperFile>(
      new GetRoundPaperSpecimenQuery(),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "exemple-feuille-de-tournee.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }

  /** Le dossier des tournées du jour d'exemple (décision de Hugo du 2026-10-26). */
  @Get("rounds-dossier.pdf")
  async roundsDossier(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetDayRoundsDossierSpecimenQuery, RoundPaperFile>(
      new GetDayRoundsDossierSpecimenQuery(),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "exemple-dossier-tournees.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
