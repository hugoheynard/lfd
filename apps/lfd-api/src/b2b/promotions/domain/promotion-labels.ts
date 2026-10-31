import type { LabelAudience } from "./promotion-audience-set.js";

/** Le libellé montré au client ; anglais et italien `null` = repli sur le français. */
export interface PromotionLabel {
  readonly fr: string;
  readonly en: string | null;
  readonly it: string | null;
}

/**
 * **Les libellés d'audience** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 15.1 décision 2, § 15.12 Q2, lot L8b) : facultatifs, ils REMPLACENT le
 * libellé commun pour l'audience qu'ils nomment. `null` = le commun suffit.
 */
export interface PromotionAudienceLabels {
  readonly individuals: PromotionLabel | null;
  readonly pros: PromotionLabel | null;
}

export const NO_AUDIENCE_LABELS: PromotionAudienceLabels = { individuals: null, pros: null };

/** Les trois langues du client. */
export type PromotionLabelLanguage = "fr" | "en" | "it";

/**
 * Le libellé dans les trois langues, sans trou — ce que la trace d'une ligne
 * et la commande FIGENT (§ 15.12 Q1) : un document relu plus tard dans la
 * langue du client ne dépend pas d'une promotion modifiée depuis.
 */
export interface ServedPromotionLabel {
  readonly fr: string;
  readonly en: string;
  readonly it: string;
}

/**
 * **Le libellé qu'un client lit**, dans sa langue : celui de son audience dans
 * la langue, sinon son français, sinon le commun dans la langue, sinon le
 * commun en français. `audience` `null` = audience inconnue ⇒ le commun.
 */
export function labelFor(
  common: PromotionLabel,
  labels: PromotionAudienceLabels,
  audience: LabelAudience | null,
  language: PromotionLabelLanguage,
): string {
  const own = audience === null ? null : labels[audience];
  if (own !== null) {
    return own[language] ?? own.fr;
  }
  return common[language] ?? common.fr;
}

/** Les trois langues d'une audience, résolues par {@link labelFor}. */
export function servedLabelFor(
  common: PromotionLabel,
  labels: PromotionAudienceLabels,
  audience: LabelAudience | null,
): ServedPromotionLabel {
  return {
    fr: labelFor(common, labels, audience, "fr"),
    en: labelFor(common, labels, audience, "en"),
    it: labelFor(common, labels, audience, "it"),
  };
}
