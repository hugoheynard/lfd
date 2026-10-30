import { PromotionWrongSurfaceError } from "./errors/promotion-errors.js";
import type { PromotionFulfillment } from "./promotion-fulfillment.js";

/**
 * **D'où une promotion est réglée** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9 et § 14 S-droits) — et donc sous quel droit.
 *
 * - `pricing` : l'écran Promotions, sous `b2b_pricing`, la ressource des
 *   règles de prix ;
 * - `pickup_point` : un point de retrait, sous `lfc_site_settings`, la ressource de la fiche du site,
 *   qui réglait la remise de ce point. Seules les promotions « retrait à CE
 *   point » s'y règlent.
 *
 * Le droit est opposé par la route ; la surface dit au geste quelles
 * promotions cette route a le droit de toucher. Sans elle, un tarifeur
 * réglerait la remise d'un site par l'écran Promotions, et l'inverse.
 */
export type PromotionSurface =
  { readonly kind: "pricing" } | { readonly kind: "pickup_point"; readonly pickupId: string };

export const PRICING_SURFACE: PromotionSurface = { kind: "pricing" };

/**
 * **Cet acheminement se règle-t-il depuis cette surface ?**
 *
 * @throws {PromotionWrongSurfaceError} il appartient à l'autre surface.
 */
export function assertSurfaceAdmits(
  surface: PromotionSurface,
  fulfillment: PromotionFulfillment,
  promotionId: string | null,
): void {
  const atPoint = fulfillment.kind === "pickup_point";
  if (surface.kind === "pricing" && atPoint) {
    throw new PromotionWrongSurfaceError(promotionId, "pickup_point");
  }
  if (surface.kind === "pickup_point" && (!atPoint || fulfillment.pickupId !== surface.pickupId)) {
    throw new PromotionWrongSurfaceError(promotionId, "pricing");
  }
}
