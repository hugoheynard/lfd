import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

// ─── Données mal formées : le modèle se protège lui-même (400) ───────────────

/**
 * Un prix de vente à zéro ou négatif.
 *
 * Refusé **dans l'agrégat**, pas au bord : un contrôleur qui valide bien
 * aujourd'hui ne dit rien du prochain appelant. La règle « on ne vend pas à
 * perte ni gratuitement » appartient à l'article, pas à la route HTTP.
 */
export class InvalidB2bPriceError extends DomainError {
  constructor(readonly priceMillicents: number) {
    super(
      "catalog.price.invalid",
      `Un prix de vente doit être strictement positif (reçu : ${String(priceMillicents)} centimes).`,
    );
  }
}

// ─── Refus métier : la demande est bien formée mais impossible ici (409) ─────

/**
 * On a posé un prix B2B **identique** à celui du PIM.
 *
 * Refusé parce que la ligne serait un mensonge utile à personne : l'écran
 * afficherait « prix négocié » sur une valeur que le PIM fournit déjà, et le
 * jour où le PIM change son tarif, cette ligne fantôme empêcherait le nouveau
 * prix de passer sans que personne ne comprenne pourquoi.
 *
 * Le geste correct est l'inverse : `alignerSurLePim()`, qui retire la décision.
 */
export class RedundantB2bPriceError extends BusinessError {
  constructor(readonly priceMillicents: number) {
    super(
      "catalog.price.redundant",
      "Ce prix est déjà celui du PIM : retirez la décision plutôt que de la recopier.",
    );
  }
}

/**
 * On a voulu mettre en avant un article **masqué**.
 *
 * Les deux drapeaux se contrediraient : « ne pas le montrer » et « le montrer
 * en premier ». Plutôt que d'arbitrer en silence — et de laisser un commercial
 * croire qu'il a mis un produit en vitrine alors qu'il est invisible —, on
 * refuse et on nomme les deux gestes.
 */
export class CannotFeatureHiddenItemError extends BusinessError {
  constructor(readonly sku: string) {
    super(
      "catalog.item.featured_while_hidden",
      "Cet article est masqué du catalogue : réaffichez-le avant de le mettre en avant.",
    );
  }
}
