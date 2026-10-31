import type { PromotionAudience } from "../promotion-audience.js";
import { PromotionAudienceSet } from "../promotion-audience-set.js";
import { NO_AUDIENCE_LABELS } from "../promotion-labels.js";
import type { PromotionTerms } from "../promotion-terms.js";

/** Le début de fenêtre des fixtures — comparé aux seules autres dates du test. */
export const FROM = new Date("2026-11-01T00:00:00.000Z");
export const UNTIL = new Date("2026-12-01T00:00:00.000Z");

/**
 * `audience` : le raccourci d'avant L8b, une cible seule — relue comme la
 * base la relit (`restore`), donc `everyone_but_active_pros` reste tel quel.
 */
export type TermsOverrides = Partial<PromotionTerms> & { readonly audience?: PromotionAudience };

/** « −20 % · tout le monde · tous acheminements », sans fin : une promotion de ligne. */
export function lineTerms(overrides: TermsOverrides = {}): PromotionTerms {
  const { audience, ...rest } = overrides;
  return {
    internalName: "Promo d'automne",
    description: null,
    label: { fr: "−20 % sur tout", en: null, it: null },
    audienceLabels: NO_AUDIENCE_LABELS,
    reason: null,
    effect: { kind: "percent_off", basisPoints: 2000 },
    ownFloor: null,
    stacksOverMercuriale: false,
    cumulative: false,
    validFrom: FROM,
    validTo: null,
    audiences: PromotionAudienceSet.restore([audience ?? { kind: "everyone" }]),
    fulfillment: { kind: "displayed_price" },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...rest,
  };
}

/** « −10 % · tous sauf les pros actifs · retrait au point pk_coeur » : une promotion de panier. */
export function basketTerms(overrides: TermsOverrides = {}): PromotionTerms {
  return lineTerms({
    internalName: "Remise de retrait — Cœur de station",
    effect: { kind: "percent_off", basisPoints: 1000 },
    audience: { kind: "everyone_but_active_pros" },
    fulfillment: { kind: "basket", pickup: { points: ["pk_coeur"] }, delivery: "none" },
    ...overrides,
  });
}
