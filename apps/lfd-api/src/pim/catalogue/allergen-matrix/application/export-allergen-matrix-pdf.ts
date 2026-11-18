import type { Buffer } from "node:buffer";

import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BrandLogoSource } from "../../../../platform/brand/brand-logo.source.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AllergenCatalogueReader } from "../../../reference/allergens/domain/ports/allergen-catalogue.reader.js";
import type { MatrixFilters } from "../domain/allergen-matrix.js";
import { allergenMatrixPdfFileName } from "../domain/allergen-matrix-paper.js";
import { AllergenMatrixRenderer } from "../domain/ports/allergen-matrix.renderer.js";
import { AllergenMatrixSource } from "../domain/ports/allergen-matrix.source.js";
import { loadAllergenMatrix } from "./allergen-matrix-support.js";

/** La même matrice, imprimée — lot AM2 du plan. */
export class ExportAllergenMatrixPdfQuery {
  constructor(readonly filters: MatrixFilters) {}
}

/** Ce que la route sert : les octets et leur nom. */
export interface AllergenMatrixPdfFile {
  readonly fileName: string;
  readonly bytes: Buffer;
}

/**
 * **Imprime la matrice** : les mêmes lignes que le JSON, datées par le
 * `Clock`, le logo lu par le port de la marque (plan §2).
 *
 * @throws {BrandLogoUnavailableError} le logo manque sur le disque.
 */
@QueryHandler(ExportAllergenMatrixPdfQuery)
export class ExportAllergenMatrixPdfHandler implements IQueryHandler<
  ExportAllergenMatrixPdfQuery,
  AllergenMatrixPdfFile
> {
  constructor(
    private readonly referential: AllergenCatalogueReader,
    private readonly source: AllergenMatrixSource,
    private readonly logo: BrandLogoSource,
    private readonly clock: Clock,
    private readonly renderer: AllergenMatrixRenderer,
  ) {}

  async execute({ filters }: ExportAllergenMatrixPdfQuery): Promise<AllergenMatrixPdfFile> {
    const { matrix, productIds, familyName } = await loadAllergenMatrix(
      this.referential,
      this.source,
      filters,
    );
    const [lastModifiedAt, logo] = await Promise.all([
      this.source.lastModifiedAt(productIds),
      this.logo.load(),
    ]);
    const paper = {
      matrix,
      filters,
      familyName,
      generatedAt: this.clock.now(),
      lastModifiedAt,
    };
    return {
      fileName: allergenMatrixPdfFileName(filters.locale),
      bytes: await this.renderer.renderAllergenMatrixPdf(paper, logo),
    };
  }
}
