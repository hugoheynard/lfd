import type { LivePromotion } from "../live-promotion.js";

/** Le début de fenêtre des fixtures — comparé aux seules autres dates du test. */
export const LIVE_FROM = new Date("2026-11-01T00:00:00.000Z");
/** L'instant des questions, dans la fenêtre. */
export const ASKED_AT = new Date("2026-11-15T10:00:00.000Z");

/** « −20 % · tout le monde · tous acheminements · tout » : une promotion de ligne. */
export function livePromotion(overrides: Partial<LivePromotion> = {}): LivePromotion {
  return {
    id: "promo_1",
    label: "−20 % sur tout",
    effect: { kind: "percent_off", basisPoints: 2000 },
    stacksOverMercuriale: false,
    validFrom: LIVE_FROM,
    validTo: null,
    suspendedFrom: null,
    audience: { kind: "everyone" },
    fulfillment: { kind: "any" },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...overrides,
  };
}
