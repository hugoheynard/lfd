import {
  DomainError,
  ResourceNotFoundError,
} from "../../../../../platform/shared/errors/app-error.js";

export class ProductNotFoundError extends ResourceNotFoundError {
  constructor(readonly productId: string) {
    super("catalogue.product.not_found", `Produit « ${productId} » inconnu.`);
  }
}

/** La déclinaison visée n'appartient pas au produit (ou n'existe pas). */
export class VariantNotFoundError extends ResourceNotFoundError {
  constructor(
    readonly productId: string,
    readonly variantId: string,
  ) {
    super(
      "catalogue.variant.not_found",
      `Déclinaison « ${variantId} » inconnue pour le produit « ${productId} ».`,
    );
  }
}

/**
 * Invariant 2 du socle, vu depuis la persistance : un produit a **au moins
 * une** déclinaison et **exactement une** par défaut. La ligne lue ne le
 * respecte pas — on refuse de la rendre plutôt que de laisser une donnée
 * incohérente ressortir vers les canaux.
 */
export class InvalidProductVariantsError extends DomainError {
  constructor(
    readonly productId: string,
    reason: string,
  ) {
    super("catalogue.product.invalid_variants", `Produit « ${productId} » incohérent : ${reason}.`);
  }
}

/** Un prix ou un poids qui n'a pas de sens : négatif, fractionnaire, infini. */
export class InvalidVariantPricingError extends DomainError {
  constructor(field: string, received: number) {
    super(
      "catalogue.variant.invalid_pricing",
      `Valeur impossible pour « ${field} » (${String(received)}) : ` +
        `attendu un entier positif ou nul.`,
    );
  }
}
