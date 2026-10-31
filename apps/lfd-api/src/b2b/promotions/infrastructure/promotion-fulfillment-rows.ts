import type { UnreadablePromotionRowError } from "../domain/errors/promotion-errors.js";
import {
  listedPointsOf,
  listedZonesOf,
  reachModeOf,
  type DeliveryReach,
  type PickupReach,
  type PromotionFulfillment,
} from "../domain/promotion-fulfillment.js";
import type { Promotion } from "../domain/promotion.js";

/**
 * **L'acheminement d'une promotion, ligne ↔ domaine** (plan
 * `documentation/promotions/plan-acheminements-a-cocher.md`, § 4, § 8.4) :
 * deux colonnes de mode et deux tables de liaison. Les anciennes colonnes
 * (`fulfillment_kind`, `fulfillment_pickup_id`) ne sont ni lues ni écrites.
 */

/** Les deux colonnes de mode — `NULL` au point ligne. */
export interface PromotionFulfillmentColumns {
  readonly fulfillmentPickup: string | null;
  readonly fulfillmentDelivery: string | null;
}

/** Les liaisons, telles que le dépôt les inclut. */
export interface PromotionFulfillmentLinkRows {
  readonly pickupPoints: readonly { readonly pickupId: string }[];
  readonly deliveryZones: readonly { readonly zoneId: string }[];
}

/** Ce qu'une lecture de promotion inclut pour relire son acheminement. */
export const FULFILLMENT_LINKS = {
  pickupPoints: { select: { pickupId: true } },
  deliveryZones: { select: { zoneId: true } },
} as const;

type Unreadable = (detail: string) => UnreadablePromotionRowError;

/**
 * **Ligne → acheminement.** `listed` sans ligne de liaison est une erreur de
 * lecture nommée, jamais un ensemble vide silencieux (§ 8.4) ; des liaisons
 * sous un mode qui n'en a pas aussi.
 */
export function fulfillmentFromRow(
  applicationPoint: string,
  columns: PromotionFulfillmentColumns,
  links: PromotionFulfillmentLinkRows,
  unreadable: Unreadable,
): PromotionFulfillment {
  if (applicationPoint === "line") {
    if (columns.fulfillmentPickup !== null || columns.fulfillmentDelivery !== null) {
      throw unreadable("acheminement coché sur une promotion « dans le prix affiché »");
    }
    return { kind: "displayed_price" };
  }
  if (applicationPoint !== "basket") {
    throw unreadable(`point d'application ${applicationPoint}`);
  }
  const points = links.pickupPoints.map((link) => link.pickupId);
  const zones = links.deliveryZones.map((link) => link.zoneId);
  const pickup = reachOf("retrait", columns.fulfillmentPickup, points, unreadable);
  const delivery = reachOf("livraison", columns.fulfillmentDelivery, zones, unreadable);
  return {
    kind: "basket",
    pickup: typeof pickup === "object" ? { points: pickup.ids } : pickup,
    delivery: typeof delivery === "object" ? { zones: delivery.ids } : delivery,
  };
}

function reachOf(
  side: string,
  mode: string | null,
  ids: readonly string[],
  unreadable: Unreadable,
): "none" | "all" | { readonly ids: readonly string[] } {
  if (mode === "listed") {
    if (ids.length === 0) {
      throw unreadable(`${side} « sélection » sans aucune ligne de liaison`);
    }
    return { ids };
  }
  if (mode !== "none" && mode !== "all") {
    throw unreadable(`mode de ${side} ${mode ?? "absent"}`);
  }
  if (ids.length > 0) {
    throw unreadable(`${side} « ${mode} » avec des lignes de liaison`);
  }
  return mode;
}

/** **Acheminement → colonnes de mode.** */
export function fulfillmentColumnsOf(
  fulfillment: PromotionFulfillment,
): PromotionFulfillmentColumns {
  if (fulfillment.kind === "displayed_price") {
    return { fulfillmentPickup: null, fulfillmentDelivery: null };
  }
  return {
    fulfillmentPickup: reachModeOf(fulfillment.pickup satisfies PickupReach),
    fulfillmentDelivery: reachModeOf(fulfillment.delivery satisfies DeliveryReach),
  };
}

/** Les lignes de liaison d'une promotion, remplacées en bloc avec elle. */
export function fulfillmentLinkRowsOf(promotion: Promotion): {
  readonly points: readonly { readonly promotionId: string; readonly pickupId: string }[];
  readonly zones: readonly { readonly promotionId: string; readonly zoneId: string }[];
} {
  const { fulfillment } = promotion.terms;
  return {
    points: listedPointsOf(fulfillment).map((pickupId) => ({
      promotionId: promotion.id,
      pickupId,
    })),
    zones: listedZonesOf(fulfillment).map((zoneId) => ({ promotionId: promotion.id, zoneId })),
  };
}
