import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../../platform/shared/errors/app-error.js";

export class CategoryNotFoundError extends ResourceNotFoundError {
  constructor(readonly categoryId: string) {
    super("catalogue.category.not_found", `Famille « ${categoryId} » inconnue.`);
  }
}

export class CategoryArchivedError extends BusinessError {
  constructor(readonly categoryId: string) {
    super(
      "catalogue.category.archived",
      "Impossible de rattacher un produit à une famille archivée.",
    );
  }
}

/** Invariant 5 du socle : archiver une famille portant des produits actifs est refusé. */
export class CategoryHasActiveProductsError extends BusinessError {
  constructor(readonly categoryId: string) {
    super(
      "catalogue.category.has_active_products",
      "Cette famille porte encore des produits actifs : les déplacer avant de l’archiver.",
    );
  }
}

/** Invariant 5 du socle : l'arbre des familles ne doit pas contenir de cycle. */
export class CategoryCycleError extends BusinessError {
  constructor(readonly categoryId: string) {
    super(
      "catalogue.category.cycle",
      "Ce déplacement créerait un cycle dans l’arbre des familles.",
    );
  }
}

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
