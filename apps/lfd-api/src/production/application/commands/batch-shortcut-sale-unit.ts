import type { SaleUnit } from "@lfd/money";

import type { SellableArticlesReader } from "../../channels/commerce/sellable-articles.reader.js";

/**
 * L'unité d'un article, lue au commerce, pour qu'un refus de raccourci dise
 * « grammes » ou « pièces » (`documentation/pricing/vente-au-poids.md`).
 * `null` : l'article n'est plus vendable — le refus reste, sans nommer d'unité.
 */
export async function saleUnitOfSku(
  articles: SellableArticlesReader,
  sku: string,
): Promise<SaleUnit | null> {
  const found = (await articles.sellableArticles()).find((article) => article.sku === sku);
  return found?.saleUnit ?? null;
}
