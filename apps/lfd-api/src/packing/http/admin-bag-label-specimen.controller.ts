import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";
import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import type { BagLabelsFile } from "../application/containers/get-bag-labels-pdf.handler.js";
import { GetBagLabelSpecimenQuery } from "../application/queries/get-bag-label-specimen.query.js";

/**
 * **L'étiquette de sac d'EXEMPLE** — la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Sous `b2b_accounting` et NON `production_packing`, pour la raison de la
 * feuille de tournée d'exemple : la planche est un écran de la Comptabilité,
 * ouvert par un seul droit, et chaque bloc y sert ses exemplaires sous le même
 * préfixe. Il n'injecte que le `QueryBus`.
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminBagLabelSpecimenController {
  constructor(private readonly queries: QueryBus) {}

  @Get("bag-label.pdf")
  async bagLabel(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetBagLabelSpecimenQuery, BagLabelsFile>(
      new GetBagLabelSpecimenQuery(),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "exemple-etiquette-de-sac.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
