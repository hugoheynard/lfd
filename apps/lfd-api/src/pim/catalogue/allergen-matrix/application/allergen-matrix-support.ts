import { readLocalized } from "@lfd/pim-contracts";

import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import {
  buildAllergenMatrix,
  retainedProducts,
  type AllergenMatrix,
  type MatrixFilters,
} from "../domain/allergen-matrix.js";
import type {
  AllergenMatrixSource,
  MatrixFamilyRecord,
} from "../domain/ports/allergen-matrix.source.js";

/** La matrice, et les fiches qu'elle a retenues — de quoi la dater. */
export interface LoadedAllergenMatrix {
  readonly matrix: AllergenMatrix;
  readonly productIds: readonly string[];
  /** Le nom de la famille filtrée, dans la langue ; `null` = toutes. */
  readonly familyName: string | null;
  /** Toutes les familles lues, pour la liste du filtre — pas de seconde lecture. */
  readonly families: readonly MatrixFamilyRecord[];
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
    familyName: familyNameOf(families, filters),
    families,
  };
}

/** Le périmètre imprimé nomme la famille ; une inconnue a déjà été refusée. */
function familyNameOf(
  families: readonly MatrixFamilyRecord[],
  filters: MatrixFilters,
): string | null {
  const family = families.find((candidate) => candidate.id === filters.categoryId);
  return family === undefined ? null : readLocalized(family.name, filters.locale);
}
