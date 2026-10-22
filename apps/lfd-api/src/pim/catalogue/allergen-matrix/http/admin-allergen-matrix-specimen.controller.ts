import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";
import { contentDispositionInline, sanitiseFileName } from "@lfd/storage";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import type { AllergenMatrixPdfFile } from "../application/export-allergen-matrix-pdf.js";
import { GetAllergenMatrixSpecimenQuery } from "../application/queries/get-allergen-matrix-specimen.handler.js";

/**
 * **La matrice des allergènes d'EXEMPLE** — la planche des documents de la
 * Comptabilité (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Sous `b2b_accounting` en lecture, comme les autres exemplaires de la
 * planche, et non sous `allergen_matrix` : la planche est un écran de la
 * Comptabilité, et un seul droit l'ouvre. Le nom de la ressource n'est qu'une
 * valeur : aucun import du commerce.
 *
 * 🔴 Servi HORS du préfixe `/pim` (`PimDocumentSpecimensModule`, absent de
 * l'arbre de routes du référentiel) : la planche lit tous ses exemplaires sous
 * `/admin/document-specimens`, et chaque bloc y sert les siens. Il n'injecte
 * que le `QueryBus`.
 */
@Controller("admin/document-specimens")
@AdminSurface("b2b_accounting")
export class AdminAllergenMatrixSpecimenController {
  constructor(private readonly queries: QueryBus) {}

  @Get("allergen-matrix.pdf")
  async matrix(@Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const pdf = await this.queries.execute<GetAllergenMatrixSpecimenQuery, AllergenMatrixPdfFile>(
      new GetAllergenMatrixSpecimenQuery(),
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionInline(sanitiseFileName(pdf.fileName, "exemple-matrice-allergenes.pdf")),
    );
    return new StreamableFile(pdf.bytes);
  }
}
