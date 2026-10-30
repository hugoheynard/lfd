import type { AdmittedPromotion, LivePromotion } from "../live-promotion.js";
import type { PromotionAudience } from "../promotion-audience.js";
import { NO_AUDIENCE_LABELS } from "../promotion-labels.js";
import { PUBLIC_RANK } from "../promotion-targeting.js";

/** Le début de fenêtre des fixtures — comparé aux seules autres dates du test. */
export const LIVE_FROM = new Date("2026-11-01T00:00:00.000Z");
/** L'instant des questions, dans la fenêtre. */
export const ASKED_AT = new Date("2026-11-15T10:00:00.000Z");

/**
 * Les raccourcis d'avant L8b, gardés pour que les suites de L5-L8 se lisent
 * comme avant : `audience` = une cible seule, `label` = le libellé commun
 * français.
 */
export type LivePromotionOverrides = Partial<Omit<LivePromotion, "label">> & {
  readonly audience?: PromotionAudience;
  readonly label?: string;
};

/** « −20 % · tout le monde · tous acheminements · tout » : une promotion de ligne. */
export function livePromotion(overrides: LivePromotionOverrides = {}): LivePromotion {
  const { audience, label, ...rest } = overrides;
  return {
    id: "promo_1",
    label: { fr: label ?? "−20 % sur tout", en: null, it: null },
    audienceLabels: NO_AUDIENCE_LABELS,
    effect: { kind: "percent_off", basisPoints: 2000 },
    stacksOverMercuriale: false,
    cumulative: false,
    validFrom: LIVE_FROM,
    validTo: null,
    suspendedFrom: null,
    audiences: [audience ?? { kind: "everyone" }],
    fulfillment: { kind: "any" },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...rest,
  };
}

/**
 * La même, ADMISE comme la caisse la reçoit : rang de sa première cible,
 * libellé commun dans les trois langues.
 */
export function admittedPromotion(overrides: LivePromotionOverrides = {}): AdmittedPromotion {
  const live = livePromotion(overrides);
  const fr = live.label.fr;
  return {
    ...live,
    publicRank: Math.max(...live.audiences.map((audience) => PUBLIC_RANK[audience.kind])),
    servedLabel: { fr, en: live.label.en ?? fr, it: live.label.it ?? fr },
  };
}
