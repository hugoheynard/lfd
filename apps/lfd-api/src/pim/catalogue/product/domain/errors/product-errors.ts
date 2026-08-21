import { ResourceNotFoundError } from "../../../../../platform/shared/errors/app-error.js";

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
