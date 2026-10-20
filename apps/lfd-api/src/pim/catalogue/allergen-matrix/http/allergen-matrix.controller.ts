import { Controller, Get, Header, Query, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";
import {
  allergenMatrixQuerySchema,
  type AllergenMatrixQuery,
  type AllergenMatrixView,
} from "@lfd/pim-contracts";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../../../platform/shared/http/zod-body.pipe.js";
import {
  ExportAllergenMatrixCsvQuery,
  type AllergenMatrixCsvFile,
} from "../application/export-allergen-matrix-csv.js";
import {
  ExportAllergenMatrixPdfQuery,
  type AllergenMatrixPdfFile,
} from "../application/export-allergen-matrix-pdf.js";
import { GetAllergenMatrixQuery } from "../application/get-allergen-matrix.js";
import type { MatrixFilters } from "../domain/allergen-matrix.js";

function filtersOf(query: AllergenMatrixQuery): MatrixFilters {
  return {
    locale: query.locale,
    scope: query.scope,
    categoryId: query.categoryId ?? null,
    includeUndeclared: query.includeUndeclared,
  };
}

/**
 * **La matrice des allergènes** — `GET /pim/allergen-matrix` et son tableur
 * (plan `documentation/pim/plan-matrice-des-allergenes.md`, lot AM1).
 *
 * En lecture, sous SON droit `allergen_matrix` (Hugo, 2026-10-20, plan §2) :
 * lire la matrice n'est pas rédiger une fiche, `pim_catalog` n'y suffit plus.
 */
@AdminSurface("allergen_matrix")
@Controller()
export class AllergenMatrixController {
  constructor(private readonly queries: QueryBus) {}

  @Get("allergen-matrix")
  matrix(
    @Query(new ZodQuery(allergenMatrixQuerySchema)) query: AllergenMatrixQuery,
  ): Promise<AllergenMatrixView> {
    return this.queries.execute<GetAllergenMatrixQuery, AllergenMatrixView>(
      new GetAllergenMatrixQuery(filtersOf(query)),
    );
  }

  @Get("allergen-matrix.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async csv(
    @Query(new ZodQuery(allergenMatrixQuerySchema)) query: AllergenMatrixQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.queries.execute<ExportAllergenMatrixCsvQuery, AllergenMatrixCsvFile>(
      new ExportAllergenMatrixCsvQuery(filtersOf(query)),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "matrice-allergenes.csv")),
    );
    return file.csv;
  }

  /** Le PDF A4 paysage, ENTIER dans la langue demandée (lot AM2, Q4). */
  @Get("allergen-matrix.pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(
    @Query(new ZodQuery(allergenMatrixQuerySchema)) query: AllergenMatrixQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.queries.execute<ExportAllergenMatrixPdfQuery, AllergenMatrixPdfFile>(
      new ExportAllergenMatrixPdfQuery(filtersOf(query)),
    );
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(file.fileName, "matrice-allergenes.pdf")),
    );
    return new StreamableFile(file.bytes);
  }
}
