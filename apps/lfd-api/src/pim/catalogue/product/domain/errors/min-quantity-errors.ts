import { BusinessError, DomainError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Une case de la matrice qui ne dit rien de vendable : zéro, une, un nombre à
 * virgule (`documentation/catalogue/plan-quantite-minimale.md`, Q3).
 */
export class InvalidMinQuantityError extends DomainError {
  constructor(audience: string, contextKey: string, quantity: number) {
    super(
      "catalogue.variant.invalid_min_quantity",
      `Quantité minimale impossible (${audience}, contexte « ${contextKey} ») : ` +
        `${String(quantity)} n'est pas un nombre entier de pièces d'au moins 2. ` +
        `Saisissez 2 ou plus, ou laissez la case vide pour ne poser aucun minimum.`,
    );
  }
}

/**
 * Un minimum en pièces sur une déclinaison vendue au poids : elle a déjà son
 * minimum, en grammes (`weightMinGrams`, Q3), et personne ne lirait celui-ci.
 */
export class MinQuantityOnWeightSaleError extends BusinessError {
  constructor(sku: string) {
    super(
      "catalogue.variant.min_quantity_on_weight_sale",
      `La déclinaison « ${sku} » se vend au poids : sa quantité minimale se règle en grammes, ` +
        `dans « Tarif & TVA » (minimum au poids). Laissez la grille des pièces vide.`,
    );
  }
}

/** La déclinaison par défaut ne suit pas son propre minimum : c'est elle, la source. */
export class DefaultVariantCannotFollowMinQuantityError extends DomainError {
  constructor(sku: string) {
    super(
      "catalogue.variant.default_cannot_follow_min_quantity",
      `La déclinaison « ${sku} » est celle par défaut : c'est elle que les autres suivent, ` +
        `elle ne peut pas suivre sa propre quantité minimale. Saisissez sa grille.`,
    );
  }
}

/**
 * Une case qui croise une clientèle avec un contexte qui n'est pas le sien :
 * le contexte B2B est celui des professionnels (retrait comme livraison), les
 * autres — à emporter, sur place — sont ceux des particuliers (Hugo, 2026-10-29).
 */
export class MinQuantityContextOutsideAudienceError extends DomainError {
  constructor(audience: string, contextKey: string) {
    super(
      "catalogue.variant.min_quantity_context_outside_audience",
      `Quantité minimale impossible : le contexte « ${contextKey} » ne se vend pas ` +
        `${audience === "pro" ? "aux professionnels" : "aux particuliers"}. ` +
        `Les professionnels achètent dans le contexte B2B, les particuliers à emporter ou sur place.`,
    );
  }
}
