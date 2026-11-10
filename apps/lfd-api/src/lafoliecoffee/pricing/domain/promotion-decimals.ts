import { fromCents, MILLICENTS_PER_CENT, roundToCents, type SaleUnit } from "@lfd/money";

import type { AdmittedPromotion, LivePromotion } from "../../promotions/domain/live-promotion.js";
import { applicationPointOf } from "../../promotions/domain/promotion-fulfillment.js";
import { servedLabelFor } from "../../promotions/domain/promotion-labels.js";
import { applyRule } from "./price-rule-application.js";
import { promotionAsRule } from "./promotion-as-rule.js";

/** Un article vendu aux pros, à son prix pro HT. */
export interface ProPricedArticle {
  readonly sku: string;
  readonly productSku: string;
  readonly name: string;
  /** Sa famille puis ses parentes, la plus proche en tête. */
  readonly categoryPath: readonly string[];
  readonly saleUnit: SaleUnit;
  readonly priceMillicents: number;
}

/** Un article dont le net passe sous le centime. */
export interface DecimalNet {
  readonly article: ProPricedArticle;
  readonly netMillicents: number;
}

/**
 * **Les articles dont le prix net aura plus de deux décimales**
 * (`documentation/promotions/plan-remise-par-ligne.md`, § 18.7) — ce que
 * l'écran d'une promotion AVERTIT, sans jamais refuser.
 *
 * Avec des prix pro saisis au centime, seule une remise en POURCENTAGE dans
 * le prix affiché en crée : tout autre effet, et toute remise de panier,
 * rend une liste vide.
 *
 * Le net se calcule par la règle même de la porte du prix : la promotion
 * présentée en règle (`promotionAsRule` — portée, extension au poids,
 * exclusions), appliquée en exact (`applyRule`) puis arrondie une fois
 * (`roundToCents`). Le plancher et le cumul avec d'autres étages ne sont pas
 * rejoués : l'avertissement parle de CETTE promotion seule, sur le prix pro.
 */
export function promotionDecimalNets(
  promotion: LivePromotion,
  articles: readonly ProPricedArticle[],
  at: Date,
): DecimalNet[] {
  if (promotion.effect.kind !== "percent_off") {
    return [];
  }
  if (applicationPointOf(promotion.fulfillment) !== "line") {
    return [];
  }
  const admitted = asPreviewed(promotion);
  const nets: DecimalNet[] = [];
  for (const article of articles) {
    const net = netOf(admitted, article, at);
    if (net !== null && net % MILLICENTS_PER_CENT !== 0) {
      nets.push({ article, netMillicents: net });
    }
  }
  return nets;
}

/** Le net de l'article sous la promotion ; `null` = elle ne le vise pas. */
function netOf(promotion: AdmittedPromotion, article: ProPricedArticle, at: Date): number | null {
  const rule = promotionAsRule(promotion, {
    at,
    quantity: 1,
    variantSku: article.sku,
    productSku: article.productSku,
    categoryPath: article.categoryPath,
    saleUnit: article.saleUnit,
    companyId: null,
    pricingCompanyId: null,
    segmentId: null,
    cumulativeQuantity: null,
  });
  return rule === null ? null : roundToCents(applyRule(fromCents(article.priceMillicents), rule));
}

/**
 * La promotion admise POUR UN APERÇU : les rangs ne départagent que des
 * rivales, et le libellé ne change pas le prix — un pro les lirait ainsi.
 */
function asPreviewed(promotion: LivePromotion): AdmittedPromotion {
  return {
    ...promotion,
    publicRank: 0,
    fulfillmentRank: 0,
    servedLabel: servedLabelFor(promotion.label, promotion.audienceLabels, "pros"),
  };
}
