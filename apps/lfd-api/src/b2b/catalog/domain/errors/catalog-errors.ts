import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

// ─── Refus métier : la demande est bien formée mais impossible ici (409) ─────
//
// Les refus de prix décidé (`catalog.price.*`, `catalog.public_price.*`) sont
// partis avec leurs gestes au lot D (2026-10-15) : le prix ne se décide plus
// sur la plateforme.

/** Les mots d'une audience dans un message lu par le staff. */
const AUDIENCE_WORDS = { pro: "aux professionnels", public: "au public" } as const;

/**
 * On a voulu mettre en avant un article **masqué**.
 *
 * Les deux drapeaux se contrediraient : « ne pas le montrer » et « le montrer
 * en premier ». Plutôt que d'arbitrer en silence — et de laisser un commercial
 * croire qu'il a mis un produit en vitrine alors qu'il est invisible —, on
 * refuse et on nomme les deux gestes.
 */
export class CannotFeatureHiddenItemError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly viewer: "pro" | "public",
  ) {
    super(
      "catalog.item.featured_while_hidden",
      `L'article ${sku} est masqué ${AUDIENCE_WORDS[viewer]} : ` +
        "réaffichez-le pour cette audience avant de l'y mettre en avant.",
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

/**
 * On a voulu masquer un article pour une audience à laquelle le référentiel
 * ne le vend pas (H5, D7 du plan d'audience).
 *
 * Il n'y a rien à retirer : le masquage ne fait que retirer, et l'article n'est
 * déjà pas servi à ce lecteur. Accepter écrirait une décision sans effet, que
 * l'écran afficherait comme un geste pris.
 */
export class MaskingOutsideAudienceError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly viewer: "pro" | "public",
  ) {
    super(
      "catalog.item.masking_outside_audience",
      `L'article ${sku} n'est pas vendu ${AUDIENCE_WORDS[viewer]} : il n'y a rien à masquer. ` +
        "Pour changer à qui il se vend, modifiez son audience dans le référentiel.",
    );
  }
}

/**
 * On a voulu mettre un article en avant pour une audience à laquelle le
 * référentiel ne le vend pas (2026-10-18). La mise en avant ne se verrait
 * nulle part : accepter écrirait une décision sans effet, que l'écran
 * afficherait comme un geste pris.
 */
export class FeaturingOutsideAudienceError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly viewer: "pro" | "public",
  ) {
    super(
      "catalog.item.featuring_outside_audience",
      `L'article ${sku} n'est pas vendu ${AUDIENCE_WORDS[viewer]} : il ne peut pas y être mis en avant. ` +
        "Pour changer à qui il se vend, modifiez son audience dans le référentiel.",
    );
  }
}
