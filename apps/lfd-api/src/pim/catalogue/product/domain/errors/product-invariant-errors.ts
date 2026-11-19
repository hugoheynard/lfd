import { TechnicalError } from "../../../../../platform/shared/errors/app-error.js";

/** L'agrégat a atteint l'écriture sans déclinaison par défaut : l'invariant 2 a été contourné en amont. */
export class ProductWithoutVariantError extends TechnicalError {
  constructor(productId: string) {
    super(
      "catalogue.product.without_variant",
      `La fiche ${productId} n'a aucune déclinaison au moment d'être écrite : l'agrégat ` +
        `refuse pourtant de naître sans la déclinaison par défaut — chercher qui a construit la fiche par un autre chemin.`,
    );
  }
}

/** Le dépôt des allergènes a été appelé pour une déclinaison qui n'a rien déclaré. */
export class UndeclaredAllergensWriteError extends TechnicalError {
  constructor(productId: string, variantId: string) {
    super(
      "catalogue.product.undeclared_allergens_write",
      `La déclinaison ${variantId} de la fiche ${productId} n'a aucune déclaration d'allergènes ` +
        `au moment d'être écrite : le geste doit la poser sur la fiche (declareAllergens) avant d'appeler le dépôt.`,
    );
  }
}
