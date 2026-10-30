import {
  PromotionCategoryAgainstModeError,
  PromotionDuplicateScopeRuleError,
  PromotionInvalidTargetRankError,
  PromotionScopeIncludesNothingError,
} from "./errors/promotion-errors.js";
import { NATURAL_TARGET_RANK, type PromotionScope } from "./promotion-scope.js";

/** Le seul rang posé qui diffère du naturel : une déclinaison reprise d'un produit. */
const REPRISED_PRODUCT_RANK = NATURAL_TARGET_RANK.product;

/**
 * **Les invariants d'une portée**, repris de la remise de retrait
 * (`pickup-discount.ts`) — tenus à la pose ET à la relecture : une ligne écrite
 * par la reprise SQL qui les contournerait est refusée au chargement, et
 * l'e2e de la migration le dit (§ 14 S-invariants).
 *
 * @throws {PromotionDuplicateScopeRuleError} une cible réglée deux fois.
 * @throws {PromotionScopeIncludesNothingError} « seulement » sans inclusion.
 * @throws {PromotionCategoryAgainstModeError} une famille à contre-sens du mode.
 * @throws {PromotionInvalidTargetRankError} un rang posé ailleurs que sur une déclinaison reprise.
 */
export function assertScope(scope: PromotionScope): void {
  const seen = new Set<string>();
  for (const rule of scope.rules) {
    const key = `${rule.target}:${rule.targetId}`;
    if (seen.has(key)) {
      throw new PromotionDuplicateScopeRuleError(rule.target, rule.targetId);
    }
    seen.add(key);
    const rankAllowed =
      rule.targetRank === null ||
      (rule.target === "variant" && rule.targetRank === REPRISED_PRODUCT_RANK);
    if (!rankAllowed) {
      throw new PromotionInvalidTargetRankError(rule.targetId, rule.targetRank ?? 0);
    }
  }
  if (scope.mode === "only" && !scope.rules.some((rule) => rule.eligible)) {
    throw new PromotionScopeIncludesNothingError();
  }
  const allowed = scope.mode === "only";
  const reversed = scope.rules.find(
    (rule) => rule.target === "category" && rule.eligible !== allowed,
  );
  if (reversed !== undefined) {
    throw new PromotionCategoryAgainstModeError(reversed.targetId, scope.mode);
  }
}
