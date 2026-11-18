import { FIRST_SHIPMENT_RANK } from "../../../production/channels/packing/index.js";
import { PackingTrackingLevelUnknownError } from "../errors/packing-settings-errors.js";

/**
 * **Le niveau de suivi d'une fiche du colisage** (plan
 * `documentation/colisage/plan-niveaux-de-suivi-colisage.md`, D2–D3) :
 * `simple` — « Tout est prêt » ou « Problème » — ou `detailed` — contenants,
 * répartition, « Déclarer prête ».
 */
export const PACKING_TRACKING_LEVELS = ["simple", "detailed"] as const;
export type PackingTrackingLevel = (typeof PACKING_TRACKING_LEVELS)[number];

/** Personne n'a rien réglé : un retrait se colise en simple (Hugo, 2026-11-18). */
export const DEFAULT_PICKUP_TRACKING_LEVEL: PackingTrackingLevel = "simple";

/** Le niveau d'une fiche dont rien n'est figé : celui d'aujourd'hui, détaillé. */
export const UNFIXED_TRACKING_LEVEL: PackingTrackingLevel = "detailed";

/** @throws {PackingTrackingLevelUnknownError} la valeur n'est pas un niveau. */
export function packingTrackingLevelOf(raw: string): PackingTrackingLevel {
  const level = PACKING_TRACKING_LEVELS.find((candidate) => candidate === raw);
  if (level === undefined) {
    throw new PackingTrackingLevelUnknownError(raw);
  }
  return level;
}

/** Une fiche telle que la liste à coliser la fait naître. */
export interface SheetAtBirth {
  readonly fulfillmentMethod: "pickup" | "delivery";
  /** 1 = la commande ; au-delà, un reliquat. */
  readonly rank: number;
}

/**
 * **D'où vient le niveau figé à la naissance d'une fiche** (D1, D3) :
 * - `none` — une livraison reste sans niveau (lue détaillée), quel que soit
 *   le réglage ;
 * - `setting` — un retrait prend le réglage du colisage ;
 * - `origin` — un reliquat (rang > 1) prend le niveau de sa fiche d'origine,
 *   `null` compris.
 */
export type TrackingLevelSource = "none" | "setting" | "origin";

export function trackingLevelSourceOf(sheet: SheetAtBirth): TrackingLevelSource {
  if (sheet.fulfillmentMethod !== "pickup") {
    return "none";
  }
  return sheet.rank > FIRST_SHIPMENT_RANK ? "origin" : "setting";
}

/** Le niveau d'une fiche tel qu'on le lit : `null` — rien de figé — vaut détaillé. */
export function readTrackingLevel(fixed: PackingTrackingLevel | null): PackingTrackingLevel {
  return fixed ?? UNFIXED_TRACKING_LEVEL;
}
