import {
  type AudiencePickupDiscount,
  type CustomerAudience,
  type GpsPoint,
  gpsPointSchema,
  type PickupAddressView,
  type PickupDiscounts,
  type PickupOpening,
  pickupOpeningSchema,
  type StoredSiteView,
} from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";
import { fromAdjustmentColumns } from "../../pricing/cart-adjustment.mapper.js";

/**
 * **La ligne d'un site**, et ses deux lectures — la vue du point de retrait
 * (client, commandes) et la vue du site (écran des réglages). Une seule
 * sélection, un seul décodage des colonnes JSON : les deux vues ne peuvent pas
 * diverger sur ce qu'elles relisent.
 */
export const SITE_SELECT = {
  id: true,
  label: true,
  ligne1: true,
  ligne2: true,
  codePostal: true,
  ville: true,
  pays: true,
  discountMode: true,
  discountValue: true,
  discountForB2b: true,
  discountScope: true,
  b2cDiscountMode: true,
  b2cDiscountValue: true,
  b2cDiscountScope: true,
  discountRules: { select: { audience: true, target: true, targetId: true, eligible: true } },
  opening: true,
  gps: true,
  pickup: true,
  pickupForB2b: true,
  pickupForB2c: true,
  supply: true,
  deliveryDeparture: true,
  archivedAt: true,
  transferMode: true,
  counterSetupMinutes: true,
  eatIn: true,
  pickupColorB2b: true,
  pickupColorB2c: true,
  deliveryColorB2b: true,
  deliveryColorB2c: true,
} as const;

export type SiteRow = Prisma.SiteGetPayload<{ select: typeof SITE_SELECT }>;

/**
 * Les heures d'ouverture figées en JSON. Validées plutôt que castées : un point
 * antérieur à la colonne n'en porte pas, et l'absence se lit « aucune heure
 * déclarée » — l'écran doit alors le dire, pas accepter n'importe quelle heure.
 */
export function openingOf(value: Prisma.JsonValue | null): PickupOpening {
  const parsed = pickupOpeningSchema.safeParse(value);
  return parsed.success ? parsed.data : { publicOpening: null, proPickup: null };
}

/** Le point GPS, validé plutôt que casté : une forme illisible se lit « non saisi ». */
export function gpsOf(value: Prisma.JsonValue | null): GpsPoint | null {
  const parsed = gpsPointSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

type RuleRow = SiteRow["discountRules"][number];

/** La remise d'une clientèle, depuis ses colonnes et ses règles. */
function audienceDiscountOf(
  adjustment: AudiencePickupDiscount["adjustment"] | null,
  scope: AudiencePickupDiscount["scope"],
  rules: readonly RuleRow[],
  audience: CustomerAudience,
): AudiencePickupDiscount | null {
  if (adjustment === null) {
    return null;
  }
  // L'ordre de saisie n'existe pas : celui de la cible, pour une lecture stable.
  const own = rules
    .filter((rule) => rule.audience === audience)
    .sort((left, right) => left.targetId.localeCompare(right.targetId));
  return {
    adjustment,
    scope,
    categories: own
      .filter((rule) => rule.target === "category")
      .map((rule) => ({ categoryId: rule.targetId, eligible: rule.eligible })),
    products: own
      .filter((rule) => rule.target === "product")
      .map((rule) => ({ productId: rule.targetId, eligible: rule.eligible })),
  };
}

/**
 * **Les deux remises d'un site** (2026-10-22). Celle des pros est la remise
 * d'avant (`discount_mode`/`discount_value`), lue seulement si la case B2B
 * était cochée — c'est la reprise sans effacement (V8) ; celle des
 * particuliers a ses colonnes, recopiées par la migration.
 */
export function discountsOf(row: SiteRow): PickupDiscounts {
  const pro = row.discountForB2b
    ? fromAdjustmentColumns(row.discountMode, row.discountValue)
    : null;
  return {
    b2b: audienceDiscountOf(pro, row.discountScope, row.discountRules, "b2b"),
    b2c: audienceDiscountOf(
      fromAdjustmentColumns(row.b2cDiscountMode, row.b2cDiscountValue),
      row.b2cDiscountScope,
      row.discountRules,
      "b2c",
    ),
  };
}

/** Le site vu comme un point de retrait — le contrat servi au client depuis août. */
export function toPickupView(row: SiteRow): PickupAddressView {
  return {
    id: row.id,
    label: row.label,
    ligne1: row.ligne1,
    ligne2: row.ligne2,
    codePostal: row.codePostal,
    ville: row.ville,
    opening: openingOf(row.opening),
    pays: row.pays,
    discounts: discountsOf(row),
    pickupAudiences: { b2b: row.pickupForB2b, b2c: row.pickupForB2c },
    gps: gpsOf(row.gps),
  };
}

/** Le site tel que l'écran des réglages le lit. */
export function toSiteView(row: SiteRow): StoredSiteView {
  return {
    ...toPickupView(row),
    gps: gpsOf(row.gps),
    pickup: row.pickup,
    supply: row.supply,
    deliveryDeparture: row.deliveryDeparture,
    transferMode: row.transferMode,
    counterSetupMinutes: row.counterSetupMinutes,
    eatIn: row.eatIn,
    pickupColorB2b: row.pickupColorB2b,
    pickupColorB2c: row.pickupColorB2c,
    deliveryColorB2b: row.deliveryColorB2b,
    deliveryColorB2c: row.deliveryColorB2c,
    archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
  };
}
