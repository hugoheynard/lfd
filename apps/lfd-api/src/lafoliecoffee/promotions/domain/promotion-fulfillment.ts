import {
  PromotionBlankFulfillmentTargetError,
  PromotionDuplicateFulfillmentTargetError,
  PromotionEmptyFulfillmentListError,
  PromotionReachesNothingError,
  type FulfillmentSide,
} from "./errors/promotion-fulfillment-errors.js";

/**
 * **L'acheminement d'une promotion** (`documentation/promotions/promotions.md`, § 2.14).
 *
 * Deux formes :
 *
 * - `displayed_price` — « dans le prix affiché » : la promotion agit sur la
 *   LIGNE (l'étage `promotion` de la chaîne de prix), quel que soit
 *   l'acheminement ; l'ancien `any` ;
 * - `basket` — « en remise au panier » : retrait et livraison se COCHENT, et
 *   chacun vise tout, une sélection, ou rien. Un point ET une zone tiennent
 *   dans UNE promotion ;
 * - `delivery_fee` — « sur la livraison » : la promotion offre le frais de
 *   livraison (`frais-et-livraison-offerte.md`). Toutes les zones ou
 *   celles-là ; le retrait n'a pas de frais à offrir.
 *
 * Il décide du **point d'application** : la ligne pour `displayed_price`, le
 * panier pour `basket`, le frais pour `delivery_fee`.
 */
export type PromotionFulfillment =
  | { readonly kind: "displayed_price" }
  | {
      readonly kind: "basket";
      readonly pickup: PickupReach;
      readonly delivery: DeliveryReach;
    }
  | { readonly kind: "delivery_fee"; readonly delivery: DeliveryFeeReach };

/** Le retrait d'une promotion de panier : aucun, tous les points, ou ceux-là. */
export type PickupReach = "none" | "all" | { readonly points: readonly string[] };

/** La livraison d'une promotion de panier : aucune, toutes les zones, ou celles-là. */
export type DeliveryReach = "none" | "all" | { readonly zones: readonly string[] };

/** Les zones d'une promotion sur la livraison : toutes, ou celles-là — jamais aucune. */
export type DeliveryFeeReach = Exclude<DeliveryReach, "none">;

/** Une promotion de panier — la forme qui coche. */
export type BasketFulfillment = Extract<PromotionFulfillment, { readonly kind: "basket" }>;

/** Où la promotion agit : sur le prix d'une ligne, sur le panier, ou sur le frais de livraison. */
export type PromotionApplicationPoint = "line" | "basket" | "delivery_fee";

const POINT_OF: Readonly<Record<PromotionFulfillment["kind"], PromotionApplicationPoint>> = {
  displayed_price: "line",
  basket: "basket",
  delivery_fee: "delivery_fee",
};

/** Dérivé, jamais saisi : la colonne `application_point` n'en est que le miroir. */
export function applicationPointOf(fulfillment: PromotionFulfillment): PromotionApplicationPoint {
  return POINT_OF[fulfillment.kind];
}

/** Les points nommés ; vide pour « aucun » ou « tous ». */
export function listedPointsOf(fulfillment: PromotionFulfillment): readonly string[] {
  return fulfillment.kind === "basket" && typeof fulfillment.pickup === "object"
    ? fulfillment.pickup.points
    : [];
}

/** Les zones nommées ; vide pour « aucune » ou « toutes ». */
export function listedZonesOf(fulfillment: PromotionFulfillment): readonly string[] {
  return fulfillment.kind !== "displayed_price" && typeof fulfillment.delivery === "object"
    ? fulfillment.delivery.zones
    : [];
}

/**
 * **La forme canonique** : points et zones TRIÉS (`promotions.md`, § 2.14, révision L9).
 * Reposer la même liste dans un autre ordre n'est donc pas une révision.
 */
export function canonicalFulfillment(fulfillment: PromotionFulfillment): PromotionFulfillment {
  if (fulfillment.kind === "displayed_price") {
    return fulfillment;
  }
  if (fulfillment.kind === "delivery_fee") {
    return { kind: "delivery_fee", delivery: canonicalZones(fulfillment.delivery) };
  }
  return {
    kind: "basket",
    pickup:
      typeof fulfillment.pickup === "object"
        ? { points: sorted(fulfillment.pickup.points) }
        : fulfillment.pickup,
    delivery: canonicalZones(fulfillment.delivery),
  };
}

function canonicalZones<T extends DeliveryReach>(
  delivery: T,
): T | { readonly zones: readonly string[] } {
  return typeof delivery === "object" ? { zones: sorted(delivery.zones) } : delivery;
}

function sorted(ids: readonly string[]): readonly string[] {
  return [...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/**
 * **Les invariants de l'acheminement** (`promotions.md`, § 2.14) : une remise au panier
 * coche au moins un mode ; une sélection n'est jamais vide, ni à blanc, ni
 * en double.
 *
 * @throws {PromotionReachesNothingError} ni retrait ni livraison.
 * @throws {PromotionEmptyFulfillmentListError} une sélection vide.
 * @throws {PromotionBlankFulfillmentTargetError} un identifiant vide.
 * @throws {PromotionDuplicateFulfillmentTargetError} un identifiant en double.
 */
export function assertFulfillment(fulfillment: PromotionFulfillment): void {
  if (fulfillment.kind === "displayed_price") {
    return;
  }
  if (fulfillment.kind === "delivery_fee") {
    if (typeof fulfillment.delivery === "object") {
      assertList("delivery", fulfillment.delivery.zones);
    }
    return;
  }
  if (fulfillment.pickup === "none" && fulfillment.delivery === "none") {
    throw new PromotionReachesNothingError();
  }
  if (typeof fulfillment.pickup === "object") {
    assertList("pickup", fulfillment.pickup.points);
  }
  if (typeof fulfillment.delivery === "object") {
    assertList("delivery", fulfillment.delivery.zones);
  }
}

function assertList(side: FulfillmentSide, ids: readonly string[]): void {
  if (ids.length === 0) {
    throw new PromotionEmptyFulfillmentListError(side);
  }
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.trim() === "") {
      throw new PromotionBlankFulfillmentTargetError(side);
    }
    if (seen.has(id)) {
      throw new PromotionDuplicateFulfillmentTargetError(side, id);
    }
    seen.add(id);
  }
}

/** Le mode d'un côté tel que la table l'écrit (`fulfillment_pickup`, `fulfillment_delivery`). */
export type FulfillmentReachMode = "none" | "all" | "listed";

export function reachModeOf(reach: PickupReach | DeliveryReach): FulfillmentReachMode {
  return typeof reach === "object" ? "listed" : reach;
}
