import {
  BusinessError,
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

/** Une quantité de conditionnement qui n'emballe rien : zéro, négative, ou non entière. */
export class InvalidPackagingQuantityError extends DomainError {
  constructor(received: number) {
    super(
      "catalogue.packaging.invalid_quantity",
      `Quantité de conditionnement impossible (${String(received)}) : ` +
        `attendu un entier strictement positif — un conditionnement emballe au moins une unité.`,
    );
  }
}

/**
 * Une dérogation de taux visant un contexte que le registre ne connaît pas.
 *
 * Même refus que sur la famille, et pour la même raison : la clé serait
 * persistée sans ligne de registre en face, et personne ne saurait plus dire ce
 * qu'elle facturait.
 */
export class ProductUnknownContextError extends BusinessError {
  constructor(readonly contextKey: string) {
    super(
      "catalogue.product.unknown_sales_context",
      `Contexte de vente « ${contextKey} » inconnu.`,
    );
  }
}

/**
 * La déclinaison par défaut ne peut pas suivre la fiche réglementaire… d'elle-même.
 *
 * Le refus est ici et **aussi** en base (`CHECK`) : une fiche qui hérite d'elle
 * même n'est jamais déclarée et n'est jamais refusée — elle passerait donc la
 * mise en vente sans qu'aucun allergène ait été écrit.
 */
export class DefaultVariantCannotFollowItselfError extends DomainError {
  constructor(sku: string) {
    super(
      "catalogue.variant.default_cannot_follow_itself",
      `La déclinaison « ${sku} » est celle par défaut : elle porte sa fiche réglementaire, ` +
        `elle ne peut pas la suivre.`,
    );
  }
}

/**
 * On ne se désaligne pas d'une fiche qu'on n'a pas — et on n'aligne pas ce qui
 * n'appartient pas à ce produit.
 */
export class VariantNotInProductError extends DomainError {
  constructor(productId: string, variantId: string) {
    super(
      "catalogue.variant.not_in_product",
      `La déclinaison « ${variantId} » n'appartient pas au produit « ${productId} ».`,
    );
  }
}
