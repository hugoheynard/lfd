import type { PromotionCatalogueArticle } from "./ports/promotion-catalogue.reader.js";
import { applicationPointOf } from "./promotion-fulfillment.js";
import { overlapOf, type PromotionOverlap, type PromotionRival } from "./promotion-overlap.js";

/** Deux promotions que l'extension au poids met en conflit, et ce qu'elles se disputent. */
export interface WeightExtensionConflict {
  readonly leftId: string;
  readonly rightId: string;
  readonly overlap: PromotionOverlap;
}

/**
 * **Les conflits que l'extension des pourcentages au poids fait naître**
 * (décision de Hugo du 2026-10-31, `documentation/promotions/promotions.md`,
 * § 2.2) — pur. Rejoue le refus de chevauchement entre promotions du point
 * LIGNE, sur les seuls articles au poids : avant la bascule, une famille ou un mode ne les visait pas au point
 * ligne, donc tout chevauchement trouvé là est NOUVEAU (au panier, l'unité
 * de vente n'a jamais joué : rien n'y change) — une paire déjà en
 * conflit sur une pièce aurait été refusée à la pose.
 *
 * Un tel conflit ne casse aucun prix (`winnerOf` départage deux promotions
 * par l'avantage du client, puis l'id) : il refusera la prochaine révision de
 * l'une des deux. La liste se dresse avant la bascule, pour décider laquelle
 * resserrer.
 */
export function weightExtensionConflicts(
  promotions: readonly PromotionRival[],
  articles: readonly PromotionCatalogueArticle[],
): WeightExtensionConflict[] {
  const weighed = articles.filter((article) => article.saleUnit === "weight");
  const atLine = promotions.filter(
    (promotion) => applicationPointOf(promotion.terms.fulfillment) === "line",
  );
  const conflicts: WeightExtensionConflict[] = [];
  for (const [index, left] of atLine.entries()) {
    for (const right of atLine.slice(index + 1)) {
      const overlap = overlapOf(left, right, weighed);
      if (overlap !== null) {
        conflicts.push({ leftId: left.id, rightId: right.id, overlap });
      }
    }
  }
  return conflicts;
}
