/**
 * **Ce qu'une promotion promet sans s'appliquer encore** (`documentation/promotions/promotions.md`, § 2.16, lot L10) — sans zod : la boutique le lit au rayon.
 *
 * Deux usages, une seule forme d'effet :
 *
 * - au RAYON, une promotion conditionnée par l'acheminement ne baisse jamais
 *   le prix (l'acheminement y est inconnu) : la fiche la MENTIONNE —
 *   « −20 % avec retrait à Cœur de station » ;
 * - au panier d'un INVITÉ, une promotion réservée aux inscrits se dit —
 *   « Vous avez un compte ? Connectez-vous pour profiter de −20 % » —, sans
 *   jamais vérifier l'adresse saisie (Hugo, 2026-10-30).
 */

/**
 * L'effet, dit au client. `amount` en millicentimes — par article pour une
 * promotion de ligne, sur le panier pour une promotion de panier. Un prix
 * posé (`fixed_unit_price`) ne se dit pas en « −X » : il n'a pas d'effet ici.
 */
export type PromotionOfferEffectView =
  | { readonly kind: "percent"; readonly basisPoints: number }
  | { readonly kind: "amount"; readonly millicents: number };

/**
 * Le retrait d'une promotion de panier : aucun, tous les points, ou ceux-là
 * (`documentation/promotions/promotions.md`, § 2.14).
 */
export type PromotionPickupReachView = "none" | "all" | { readonly points: readonly string[] };

/** La livraison d'une promotion de panier : aucune, toutes les zones, ou celles-là. */
export type PromotionDeliveryReachView = "none" | "all" | { readonly zones: readonly string[] };

/**
 * L'ENSEMBLE des acheminements qui ouvrent la promotion — jamais « dans le
 * prix affiché » : celle-là baisse déjà le prix. La boutique dit « au retrait
 * à … » ou « en livraison » selon ce que le client regarde (plan des
 * acheminements, § 8.4 ; contrat cassé le 2026-10-31, pré-release).
 */
export interface PromotionOfferFulfillmentView {
  readonly pickup: PromotionPickupReachView;
  readonly delivery: PromotionDeliveryReachView;
}

/** Une promotion de panier qu'un acheminement ouvrirait sur cet article. */
export interface ShopItemFulfillmentOfferView {
  readonly effect: PromotionOfferEffectView;
  readonly fulfillment: PromotionOfferFulfillmentView;
}

/**
 * Une promotion réservée aux inscrits qui toucherait ce panier — servie au
 * seul devis anonyme. `effect` `null` : un prix posé, que le message dit
 * sans montant.
 */
export interface SignInOfferView {
  readonly effect: PromotionOfferEffectView | null;
}
