import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import {
  buildAllergenMatrix,
  retainedProducts,
  type AllergenMatrix,
  type MatrixFilters,
} from "../domain/allergen-matrix.js";
import type { AllergenMatrixSource } from "../domain/ports/allergen-matrix.source.js";

/** La matrice, et les fiches qu'elle a retenues — de quoi la dater. */
export interface LoadedAllergenMatrix {
  readonly matrix: AllergenMatrix;
  readonly productIds: readonly string[];
}

/**
 * Charger et construire — ce que le JSON et le tableur partagent. Un helper
 * et non un handler appelé par l'autre : deux cas se partagent le domaine et
 * les ports, pas leurs services (CLAUDE.md §4).
 */
export async function loadAllergenMatrix(
  referential: AllergenCatalogueReader,
  source: AllergenMatrixSource,
  filters: MatrixFilters,
): Promise<LoadedAllergenMatrix> {
  const [categories, products, families] = await Promise.all([
    referential.catalogue(),
    source.products(),
    source.families(),
  ]);
  const input = { referential: categories, products, families, filters };
  return {
    matrix: buildAllergenMatrix(input),
    productIds: retainedProducts(input).map((product) => product.id),
  };
}
