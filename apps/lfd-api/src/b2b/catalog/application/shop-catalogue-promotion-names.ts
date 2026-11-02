import type { ContentLocale, ShopCatalogueView, ShopItemView } from "@lfd/contracts";

import type { PricedArticle } from "../../pricing/domain/loaded-pricer.js";
import type { PriceStepLabels } from "../../pricing/domain/price-rule.js";

/** Le nom d'une promotion dans les trois langues, tel que la trace l'a figé. */
export type PromotionNameLabels = PriceStepLabels;

/**
 * **Les promotions qui ont baissé chaque prix du rayon** — lues dans la trace
 * que le tarificateur produit déjà, sans rien recalculer (règle de Hugo,
 * 2026-11-02).
 *
 * Seules les étapes de l'étage `promotion` comptent : une mercuriale, un
 * palier ou un engagement n'a pas de nom à dire au client. Les libellés sont
 * ceux de l'audience de l'acheteur, posés par `promotionAsRule` (`labels`) ;
 * une étape sans `labels` (trace d'avant L8b) n'a pas de nom sûr et se tait.
 * Une promotion qui agit deux fois (chaîne cumulable) n'est nommée qu'une.
 */
export function promotionNamesOf(
  priced: readonly PricedArticle[],
): ReadonlyMap<string, readonly PromotionNameLabels[]> {
  const named = new Map<string, readonly PromotionNameLabels[]>();
  for (const article of priced) {
    const seen = new Set<string>();
    const labels: PromotionNameLabels[] = [];
    for (const step of article.steps) {
      if (step.stage !== "promotion" || step.labels === undefined || seen.has(step.ruleId)) {
        continue;
      }
      seen.add(step.ruleId);
      labels.push(step.labels);
    }
    if (labels.length > 0) {
      named.set(article.sku, labels);
    }
  }
  return named;
}

/**
 * **Le nom des promotions sur les vignettes dont le prix est barré**, dans la
 * langue du rayon. Un prix non barré n'en porte pas : une promotion qu'un
 * plancher a annulée n'a rien baissé que le client puisse voir. Sans nom, la
 * clé reste absente du fil.
 */
export function withPromotionNames(
  catalogue: ShopCatalogueView,
  named: ReadonlyMap<string, readonly PromotionNameLabels[]>,
  language: ContentLocale,
): ShopCatalogueView {
  if (named.size === 0) {
    return catalogue;
  }
  return { ...catalogue, items: catalogue.items.map((item) => itemNamed(item, named, language)) };
}

function itemNamed(
  item: ShopItemView,
  named: ReadonlyMap<string, readonly PromotionNameLabels[]>,
  language: ContentLocale,
): ShopItemView {
  const labels = named.get(item.sku);
  if (labels === undefined || item.catalogPriceMillicents === undefined) {
    return item;
  }
  return { ...item, promotionNames: labels.map((label) => label[language]) };
}
