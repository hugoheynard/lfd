import { GuestOrderOutsidePublicShopError } from "../errors/order-buyer-kind-errors.js";

/**
 * **Par quelle porte la personne a commandé** : sans compte (`guest`) ou
 * reconnue par son compte (`registered`). Plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`
 * § 13.7 (lot L1).
 *
 * Posé par le HANDLER selon sa route, jamais lu d'un payload : la valeur
 * `registered` ne naît que derrière une route qui a résolu un `Principal` en
 * base, `guest` que sur la passation publique. Figé sur la commande, parce
 * que la révision ne connaît plus la route d'origine.
 *
 * Ce n'est ni la clientèle (`clientele`, pro ou public) ni l'origine
 * (self-service, back-office) : un particulier inscrit et un invité sont
 * tous deux `public`. Aucun prix ne le lit encore (L1) ; les promotions
 * « invités / inscrits » le liront.
 */
export const ORDER_BUYER_KINDS = ["guest", "registered"] as const;

export type OrderBuyerKind = (typeof ORDER_BUYER_KINDS)[number];

/** Le seul invité possible : sans société, sans saisie de l'équipe. */
export const GUEST_BUYER: OrderBuyerKind = "guest";
/** Toute passation derrière un compte reconnu, saisie de l'équipe comprise. */
export const REGISTERED_BUYER: OrderBuyerKind = "registered";

/**
 * Un invité n'a ni société ni saisie de l'équipe : la seule porte qui pose
 * `guest` est la boutique publique, qui ne porte ni l'une ni l'autre. Image
 * du CHECK `orders_buyer_kind_guest_shape`.
 *
 * @throws {GuestOrderOutsidePublicShopError} un invité avec société ou saisi par l'équipe.
 */
export function ensureBuyerKindFits(input: {
  readonly buyerKind: OrderBuyerKind;
  readonly companyId: string | null;
  readonly placedByStaffId: string | null;
}): void {
  if (
    input.buyerKind === GUEST_BUYER &&
    (input.companyId !== null || input.placedByStaffId !== null)
  ) {
    throw new GuestOrderOutsidePublicShopError();
  }
}

/** La valeur dans le vocabulaire du domaine, ou `null` si elle n'en est pas une. */
export function asOrderBuyerKind(value: string): OrderBuyerKind | null {
  return ORDER_BUYER_KINDS.find((kind) => kind === value) ?? null;
}
