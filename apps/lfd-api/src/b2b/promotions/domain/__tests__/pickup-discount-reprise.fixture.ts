import type { AudiencePickupDiscount, CustomerAudience, PickupDiscounts } from "@lfd/contracts";

import type { LivePromotion } from "../live-promotion.js";
import type { PromotionScope } from "../promotion-scope.js";
import { livePromotion } from "./live-promotion.fixture.js";

/**
 * **La remise d'un site, reprise en promotion panier** — exactement comme la
 * migration `20261031120000_la_reprise_des_promotions` l'écrit (§ 13.4) :
 * `pd_<site>_<clientèle>`, pros actifs ou « tous sauf les pros actifs »,
 * retrait à ce point, portée recopiée, produits visés par `product_id`.
 *
 * Écrite en L12 (2026-10-30) : l'ancien chemin retiré, les suites qui
 * posaient une remise de site la posent désormais en promotion, et gardent
 * leurs assertions.
 */
export function pickupDiscountPromotion(
  pickupId: string,
  clientele: CustomerAudience,
  discount: AudiencePickupDiscount,
  overrides: { readonly label?: string } = {},
): LivePromotion {
  return livePromotion({
    id: `pd_${pickupId}_${clientele}`,
    label: overrides.label ?? "Remise de retrait",
    validFrom: new Date(0),
    effect:
      discount.adjustment.mode === "percent"
        ? { kind: "percent_off", basisPoints: discount.adjustment.bp }
        : { kind: "basket_amount_off", cents: discount.adjustment.cents },
    audience: clientele === "b2b" ? { kind: "pros_active" } : { kind: "everyone_but_active_pros" },
    fulfillment: { kind: "pickup_point", pickupId },
    scope: repriseScopeOf(discount),
  });
}

/** Les promotions de ces points, une par clientèle remisée (valeur > 0). */
export function pickupDiscountPromotions(
  points: readonly { readonly id: string; readonly discounts: PickupDiscounts }[],
): LivePromotion[] {
  const out: LivePromotion[] = [];
  for (const point of points) {
    for (const clientele of ["b2b", "b2c"] as const) {
      const discount = point.discounts[clientele];
      if (discount !== null && valueOf(discount) > 0) {
        out.push(pickupDiscountPromotion(point.id, clientele, discount));
      }
    }
  }
  return out;
}

function valueOf(discount: AudiencePickupDiscount): number {
  return discount.adjustment.mode === "percent"
    ? discount.adjustment.bp
    : discount.adjustment.cents;
}

/** La portée de la reprise : produits visés par `product_id`, familles par leur id. */
export function repriseScopeOf(discount: AudiencePickupDiscount): PromotionScope {
  return {
    mode: discount.scope,
    rules: [
      ...discount.products.map((rule) => ({
        target: "product" as const,
        targetId: rule.productId,
        eligible: rule.eligible,
        targetRank: null,
      })),
      ...discount.categories.map((rule) => ({
        target: "category" as const,
        targetId: rule.categoryId,
        eligible: rule.eligible,
        targetRank: null,
      })),
    ],
  };
}
