/**
 * **D'où le calcul tire les promotions** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.5 et § 14 S-bascule) — une ligne de configuration en base, jamais une
 * variable d'environnement : la bascule n'existe que si la migration qui
 * contrôle l'égalité l'a posée.
 *
 * - `legacy` : l'existant — règles d'étage promotion et remise du site ;
 * - `shadow` : l'existant est SERVI, le nouveau calculé à côté, et tout écart
 *   journalisé (`promotions.shadow_divergence`) ;
 * - `promotions` : le nouveau seul.
 */
export const PROMOTIONS_SOURCES = ["legacy", "shadow", "promotions"] as const;

export type PromotionsSource = (typeof PROMOTIONS_SOURCES)[number];

/** La valeur dans le vocabulaire du domaine, ou `null` si elle n'en est pas une. */
export function asPromotionsSource(value: string): PromotionsSource | null {
  return PROMOTIONS_SOURCES.find((source) => source === value) ?? null;
}

/** Le chemin qui SERT le prix : l'ombre sert l'existant. */
export function servesLegacy(source: PromotionsSource): boolean {
  return source !== "promotions";
}

/** Le nouveau chemin est-il calculé — servi ou à l'ombre ? */
export function computesPromotions(source: PromotionsSource): boolean {
  return source !== "legacy";
}
