import type { PromotionCatalogueArticle } from "./ports/promotion-catalogue.reader.js";
import {
  promotionExtendsToWeight,
  promotionScopeCovers,
  type PromotionScopePoint,
} from "./promotion-scope.js";
import type { PromotionTerms } from "./promotion-terms.js";

/**
 * **Le premier article vendable que deux promotions couvrent toutes deux**,
 * ou `null` — le témoin du refus de chevauchement (`assertNoOverlap`).
 */
export function sharedArticleOf(
  left: PromotionTerms,
  right: PromotionTerms,
  articles: readonly PromotionCatalogueArticle[],
  point: "line" | "basket",
): PromotionCatalogueArticle | null {
  return (
    articles.find(
      (article) =>
        promotionScopeCovers(left.scope, article, scopePointOf(point, article, left)) &&
        promotionScopeCovers(right.scope, article, scopePointOf(point, article, right)),
    ) ?? null
  );
}

/**
 * Le point où CHAQUE promotion juge l'article — le sien : depuis le
 * 2026-10-31, un pourcentage sans quantité minimum s'étend au poids par
 * famille et par mode, un montant non ; deux rivales d'effets différents ne
 * voient donc pas le même article au poids.
 */
export function scopePointOf(
  point: "line" | "basket",
  article: PromotionCatalogueArticle,
  terms: PromotionTerms,
): PromotionScopePoint {
  if (point === "basket") {
    return { kind: "basket" };
  }
  const hasMinQuantity = terms.conditions.some((condition) => condition.kind === "min_quantity");
  return {
    kind: "line",
    saleUnit: article.saleUnit,
    extendsToWeight: promotionExtendsToWeight(terms.effect.kind, hasMinQuantity),
  };
}
