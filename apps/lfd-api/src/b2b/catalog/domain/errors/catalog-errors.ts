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

/**
 * Refus **métier** : on valide, ou on remplace, une arrivée déjà close.
 *
 * Rejouer une acceptation poserait une **seconde version** du même catalogue —
 * et une version est immuable par construction. Ce refus est le pendant
 * applicatif de la transition conditionnelle en base : deux clics simultanés
 * n'en font passer qu'un, et le second l'apprend ici.
 */
export class DeliveryAlreadyClosedError extends BusinessError {
  constructor(
    readonly deliveryId: string,
    readonly status: string,
  ) {
    super(
      "catalog.delivery.already_closed",
      status === "superseded"
        ? "Cette arrivée a été remplacée par une livraison plus récente : rechargez l'écran."
        : "Cette arrivée a déjà été validée.",
    );
  }
}

/**
 * Refus **métier** : on écarte un SKU que ni l'arrivée ni le miroir ne
 * connaissent.
 *
 * ⚠️ La garde ne dit PAS « absent de l'arrivée » : un retrait EST un SKU absent
 * de l'arrivée, et l'interdire rendrait impossible le refus d'un retrait —
 * c'est-à-dire le cas où l'on tient le plus à garder un article.
 *
 * Ce qu'elle attrape est plus étroit et plus utile : une faute de frappe, qui
 * passerait sans bruit et laisserait croire qu'on a écarté quelque chose.
 */
export class UnknownExcludedSkuError extends BusinessError {
  constructor(readonly skus: readonly string[]) {
    super(
      "catalog.delivery.unknown_excluded_sku",
      `Impossible d'écarter ${skus.join(", ")} : ni dans l'arrivée, ni au catalogue.`,
    );
  }
}
