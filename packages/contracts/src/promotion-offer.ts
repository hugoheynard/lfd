/**
 * **Ce qu'une promotion promet sans s'appliquer encore** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 8 et § 13.2 RAYON, lot L10) — sans zod : la boutique le lit au rayon.
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

/** L'acheminement qui ouvre la promotion — jamais « tous » : celle-là baisse déjà le prix. */
export type PromotionOfferFulfillmentView =
  | { readonly kind: "pickup" }
  | { readonly kind: "pickup_point"; readonly pickupId: string }
  | { readonly kind: "delivery" };

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
