import { LegacyPromotionEditorClosedError } from "./errors/promotion-errors.js";

/**
 * **D'où le calcul tire les promotions** (`documentation/promotions/promotions.md`, § 2.2 et § 2.3) — une ligne de configuration en base.
 *
 * Depuis L12, il n'en reste qu'une valeur : `promotions`. L'ancien chemin
 * (`legacy`, et l'ombre `shadow` qui le servait) est retiré du code, et la
 * migration `20261031150000_le_resserrement_des_promotions` resserre le
 * CHECK de la ligne sur `promotions` : elle n'est plus un interrupteur, elle
 * est un GARDE-FOU — une base qui n'a pas basculé refuse ce déploiement, et
 * personne ne peut remettre une valeur que plus aucun code ne sait servir.
 */
export const PROMOTIONS_SOURCES = ["promotions"] as const;

export type PromotionsSource = (typeof PROMOTIONS_SOURCES)[number];

/** La valeur dans le vocabulaire du domaine, ou `null` si elle n'en est pas une. */
export function asPromotionsSource(value: string): PromotionsSource | null {
  return PROMOTIONS_SOURCES.find((source) => source === value) ?? null;
}

/** Les deux anciens éditeurs : la grille des règles (étage promotion), la remise d'un site. */
export type LegacyPromotionEditor = "price_rule" | "site_discount";

/**
 * **Un ancien éditeur n'écrit plus** (`promotions.md`, § 2.3, L8 puis L12) : le
 * calcul ne lit plus ni les règles d'étage promotion ni la remise d'un site,
 * et l'écriture aurait l'air d'agir sans agir.
 *
 * @throws {LegacyPromotionEditorClosedError} toujours.
 */
export function refuseLegacyPromotionEditor(editor: LegacyPromotionEditor): never {
  throw new LegacyPromotionEditorClosedError(editor);
}
