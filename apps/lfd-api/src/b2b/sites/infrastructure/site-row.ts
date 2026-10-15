import {
  type GpsPoint,
  gpsPointSchema,
  type PickupAddressView,
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
  isDefault: true,
  discountMode: true,
  discountValue: true,
  discountForB2b: true,
  discountForB2c: true,
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
    isDefault: row.isDefault,
    discount: fromAdjustmentColumns(row.discountMode, row.discountValue),
    discountAudiences: { b2b: row.discountForB2b, b2c: row.discountForB2c },
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
    pickupColorB2b: row.pickupColorB2b,
    pickupColorB2c: row.pickupColorB2c,
    deliveryColorB2b: row.deliveryColorB2b,
    deliveryColorB2c: row.deliveryColorB2c,
    archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
  };
}
