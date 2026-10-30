import type { PromotionTerms } from "../promotion-terms.js";

/** Le début de fenêtre des fixtures — comparé aux seules autres dates du test. */
export const FROM = new Date("2026-11-01T00:00:00.000Z");
export const UNTIL = new Date("2026-12-01T00:00:00.000Z");

/** « −20 % · tout le monde · tous acheminements », sans fin : une promotion de ligne. */
export function lineTerms(overrides: Partial<PromotionTerms> = {}): PromotionTerms {
  return {
    internalName: "Promo d'automne",
    label: { fr: "−20 % sur tout", en: null, it: null },
    reason: null,
    effect: { kind: "percent_off", basisPoints: 2000 },
    ownFloor: null,
    stacksOverMercuriale: false,
    validFrom: FROM,
    validTo: null,
    audience: { kind: "everyone" },
    fulfillment: { kind: "any" },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...overrides,
  };
}

/** « −10 % · tous sauf les pros actifs · retrait au point pk_coeur » : une promotion de panier. */
export function basketTerms(overrides: Partial<PromotionTerms> = {}): PromotionTerms {
  return lineTerms({
    internalName: "Remise de retrait — Cœur de station",
    effect: { kind: "percent_off", basisPoints: 1000 },
    audience: { kind: "everyone_but_active_pros" },
    fulfillment: { kind: "pickup_point", pickupId: "pk_coeur" },
    ...overrides,
  });
}
