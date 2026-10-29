/** Ce qu'il faut d'un article pour juger l'unité d'une ligne. */
export interface ArticleUnit {
  readonly name: string;
  readonly saleUnit: "piece" | "weight";
}

/** Une ligne demandée, avec l'unité qu'elle déclare. */
export interface UnitLine {
  readonly sku: string;
  readonly saleUnit: "piece" | "weight";
}

/** Une ligne écartée : l'article se vend désormais dans une autre unité. */
export interface StaleUnitLine {
  readonly sku: string;
  readonly name: string;
  readonly saleUnit: "piece" | "weight";
}

/**
 * **Les lignes d'un panier dont l'unité n'est plus celle de l'article**
 * (`documentation/pricing/plan-changer-l-unite-de-vente.md`, § 8).
 *
 * Au DEVIS seulement : un panier composé à la pièce dont l'article est passé au
 * poids perd la ligne, au lieu que tout le décompte tombe sur
 * `SaleUnitMismatchError`. Jamais convertie — « 3 » pièces ne deviennent pas
 * 3 g. La passation, elle, refuse toujours (`ensureSaleQuantity`).
 *
 * Une référence inconnue du catalogue est GARDÉE : son refus (`UnknownSkuError`)
 * n'est pas celui-ci.
 */
export function splitStaleUnitLines<L extends UnitLine>(
  lines: readonly L[],
  articles: ReadonlyMap<string, ArticleUnit>,
): { readonly kept: readonly L[]; readonly removed: readonly StaleUnitLine[] } {
  const kept: L[] = [];
  const removed = new Map<string, StaleUnitLine>();
  for (const line of lines) {
    const article = articles.get(line.sku);
    if (article === undefined || article.saleUnit === line.saleUnit) {
      kept.push(line);
    } else {
      removed.set(line.sku, { sku: line.sku, name: article.name, saleUnit: article.saleUnit });
    }
  }
  return { kept, removed: [...removed.values()] };
}
