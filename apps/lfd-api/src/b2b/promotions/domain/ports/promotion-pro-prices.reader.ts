import type { ProPricedArticle } from "../../../pricing/domain/promotion-decimals.js";

/**
 * **Les articles vendus aux pros, à leur prix pro HT**
 * (`documentation/promotions/plan-remise-par-ligne.md`, § 18.7) — ce que
 * l'avertissement des décimales applique à une promotion. Déclaré ici,
 * implémenté par le catalogue, qui possède `catalog_items`.
 *
 * Distinct de `PromotionCatalogueReader` : le refus de chevauchement lit les
 * deux audiences sans prix, l'avertissement le prix pro seul.
 */
export abstract class PromotionProPricesReader {
  abstract proArticles(): Promise<readonly ProPricedArticle[]>;
}
