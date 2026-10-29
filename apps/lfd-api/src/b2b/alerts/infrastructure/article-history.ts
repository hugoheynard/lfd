import type { SaleSkuAliases } from "../../catalog/domain/sale-sku-aliases.js";

/** Les quantités récentes de chaque article, rendues sous la référence du panier. */
export function historyByAskedSku(
  recent: readonly { readonly sku: string; readonly quantity: number }[],
  asked: readonly string[],
  aliases: SaleSkuAliases,
  maxOrdersPerSku: number,
): Map<string, number[]> {
  const byArticle = new Map<string, number[]>();
  for (const line of recent) {
    const article = aliases.canonical(line.sku);
    const quantities = byArticle.get(article) ?? [];
    if (quantities.length < maxOrdersPerSku) {
      quantities.push(line.quantity);
      byArticle.set(article, quantities);
    }
  }
  return new Map(
    asked.flatMap((sku) => {
      const quantities = byArticle.get(aliases.canonical(sku));
      return quantities === undefined ? [] : [[sku, quantities] as const];
    }),
  );
}

/** Les références du panier dont l'article a déjà été commandé, sous une graphie ou une autre. */
export function everOrderedAmong(
  ever: readonly { readonly sku: string }[],
  asked: readonly string[],
  aliases: SaleSkuAliases,
): Set<string> {
  const articles = new Set(ever.map((line) => aliases.canonical(line.sku)));
  return new Set(asked.filter((sku) => articles.has(aliases.canonical(sku))));
}
