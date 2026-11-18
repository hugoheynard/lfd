import type { Locale } from "@lfd/pim-contracts";

import type { AllergenMatrix, MatrixFilters } from "./allergen-matrix.js";

/**
 * Ce que le PDF imprime : la matrice, son périmètre et ses deux dates.
 *
 * Le domaine garde ce MODÈLE ; la mise en page vit derrière `AllergenMatrixRenderer`.
 */
export interface AllergenMatrixPaper {
  readonly matrix: AllergenMatrix;
  readonly filters: MatrixFilters;
  /** Le nom de la famille filtrée ; `null` = toutes. */
  readonly familyName: string | null;
  readonly generatedAt: Date;
  readonly lastModifiedAt: Date | null;
}

/** Le nom du fichier servi : la langue y est, un PDF par langue (Q4). */
export function allergenMatrixPdfFileName(locale: Locale): string {
  return `matrice-allergenes-${locale}.pdf`;
}
