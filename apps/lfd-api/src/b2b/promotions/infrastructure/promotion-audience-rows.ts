import type { UnreadablePromotionRowError } from "../domain/errors/promotion-errors.js";
import {
  audienceCompanyIdOf,
  audienceOf,
  type PromotionAudience,
} from "../domain/promotion-audience.js";
import { PromotionAudienceSet } from "../domain/promotion-audience-set.js";
import type { PromotionLabel } from "../domain/promotion-labels.js";
import type { Promotion } from "../domain/promotion.js";

/**
 * **Le public et les libellés d'audience d'une promotion, ligne ↔ domaine**
 * (plan des promotions, § 15.5, lot L8b) — à côté des mappers de l'agrégat
 * (`promotion-rows.ts`), qu'ils complètent.
 */

/** Une cible du public (L8b) — la table fait foi. */
export interface PromotionAudienceTargetRow {
  readonly id: string;
  readonly promotionId: string;
  readonly kind: string;
  readonly companyId: string | null;
}

/** Le `audience_kind` d'une promotion à plusieurs publics. */
export const SEVERAL_AUDIENCES_KIND = "several";

/**
 * Les cibles à écrire, une ligne chacune — l'identifiant vient de
 * l'`IdGenerator` de l'adaptateur (le remplissage SQL, lui, les a composées).
 */
export function audienceTargetRowsOf(
  promotion: Promotion,
  nextId: () => string,
): PromotionAudienceTargetRow[] {
  return promotion.terms.audiences.targets.map((target) => ({
    id: nextId(),
    promotionId: promotion.id,
    kind: target.kind,
    companyId: audienceCompanyIdOf(target),
  }));
}

export function audienceProjectionOf(targets: readonly PromotionAudience[]): {
  readonly audienceKind: string;
  readonly audienceCompanyId: string | null;
} {
  const [only] = targets;
  return targets.length === 1 && only !== undefined
    ? { audienceKind: only.kind, audienceCompanyId: audienceCompanyIdOf(only) }
    : { audienceKind: SEVERAL_AUDIENCES_KIND, audienceCompanyId: null };
}

type Unreadable = (detail: string) => UnreadablePromotionRowError;

/** @throws {UnreadablePromotionRowError} aucune cible, ou une cible inconnue. */
export function audiencesOf(
  targets: readonly PromotionAudienceTargetRow[],
  unreadable: Unreadable,
): PromotionAudienceSet {
  if (targets.length === 0) {
    throw unreadable("aucune cible de public (promotion_audience_targets)");
  }
  return PromotionAudienceSet.restore(
    targets.map((target) => {
      const audience = audienceOf(target.kind, target.companyId);
      if (audience === null) {
        throw unreadable(`public ${target.kind} inconnu`);
      }
      return audience;
    }),
  );
}

export function audienceLabelOf(
  fr: string | null,
  en: string | null,
  it: string | null,
): PromotionLabel | null {
  return fr === null ? null : { fr, en, it };
}
