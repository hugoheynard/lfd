import { PromotionMissingTargetIdError } from "./errors/promotion-errors.js";

/**
 * **L'acheminement d'une promotion** : tous · retrait (tous les points) ·
 * retrait à un point · livraison (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 11 et § 13.3). La zone de livraison est prévue et non bâtie.
 *
 * Il décide aussi du **point d'application** (§ 13.2) : sans critère
 * d'acheminement, la promotion agit sur la LIGNE (l'étage `promotion` de la
 * chaîne de prix) ; avec, elle agit sur le PANIER, là où la remise de retrait
 * agit aujourd'hui — l'acheminement n'est connu qu'une fois les lignes
 * chiffrées (§ 13.6).
 */
export type PromotionFulfillment =
  | { readonly kind: "any" }
  | { readonly kind: "pickup" }
  | { readonly kind: "pickup_point"; readonly pickupId: string }
  | { readonly kind: "delivery" };

export type PromotionFulfillmentKind = PromotionFulfillment["kind"];

export const PROMOTION_FULFILLMENT_KINDS: readonly PromotionFulfillmentKind[] = [
  "any",
  "pickup",
  "pickup_point",
  "delivery",
];

/** Où la promotion agit : sur le prix d'une ligne, ou sur le panier. */
export type PromotionApplicationPoint = "line" | "basket";

/** Dérivé, jamais saisi : la colonne `application_point` n'en est que le miroir. */
export function applicationPointOf(fulfillment: PromotionFulfillment): PromotionApplicationPoint {
  return fulfillment.kind === "any" ? "line" : "basket";
}

export function fulfillmentPickupIdOf(fulfillment: PromotionFulfillment): string | null {
  return fulfillment.kind === "pickup_point" ? fulfillment.pickupId : null;
}

/**
 * L'acheminement relu de ses deux colonnes — `null` pour une valeur inconnue.
 *
 * @throws {PromotionMissingTargetIdError} un retrait « à un point » sans point.
 */
export function fulfillmentOf(kind: string, pickupId: string | null): PromotionFulfillment | null {
  switch (kind) {
    case "pickup_point":
      if (pickupId === null || pickupId.trim() === "") {
        throw new PromotionMissingTargetIdError("pickup_point");
      }
      return { kind, pickupId };
    case "any":
    case "pickup":
    case "delivery":
      return { kind };
    default:
      return null;
  }
}
