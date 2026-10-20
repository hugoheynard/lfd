import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { allergenMatrixCsv } from "../domain/allergen-matrix-csv.js";
import type { MatrixFilters } from "../domain/allergen-matrix.js";
import { AllergenMatrixSource } from "../domain/ports/allergen-matrix.source.js";
import { loadAllergenMatrix } from "./allergen-matrix-support.js";

/** La même matrice, en tableur. */
export class ExportAllergenMatrixCsvQuery {
  constructor(readonly filters: MatrixFilters) {}
}

/** Ce que la route sert : le fichier et son nom. */
export interface AllergenMatrixCsvFile {
  readonly fileName: string;
  readonly csv: string;
}

/** Les mêmes lignes que la matrice JSON, une colonne par catégorie (plan §1). */
@QueryHandler(ExportAllergenMatrixCsvQuery)
export class ExportAllergenMatrixCsvHandler implements IQueryHandler<
  ExportAllergenMatrixCsvQuery,
  AllergenMatrixCsvFile
> {
  constructor(
    private readonly referential: AllergenCatalogueReader,
    private readonly source: AllergenMatrixSource,
  ) {}

  async execute({ filters }: ExportAllergenMatrixCsvQuery): Promise<AllergenMatrixCsvFile> {
    const { matrix } = await loadAllergenMatrix(this.referential, this.source, filters);
    return {
      fileName: `matrice-allergenes-${filters.locale}.csv`,
      csv: allergenMatrixCsv(matrix, filters.locale),
    };
  }
}
