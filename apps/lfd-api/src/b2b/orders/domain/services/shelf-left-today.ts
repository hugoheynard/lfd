import type { SaleUnit } from "@lfd/money";

import type { ShelfStockLeft } from "./shelf-circuit.js";

/** Un article servi à l'appelant, réduit à ce que le reste juge : son unité de vente. */
export interface ShelfServedArticle {
  readonly saleUnit: SaleUnit;
}

/** Ce que la boutique lit d'un article pour aujourd'hui. */
export interface ShelfLeftLine {
  readonly sku: string;
  readonly saleUnit: SaleUnit;
  readonly left: number;
}

/**
 * **Ce que la vitrine annonce à un appelant** (plan du jour J, lot L7b) : le
 * reste positif des seuls articles qu'il peut commander, dans l'unité où le
 * catalogue les lui vend — celle même que la passation juge
 * (`ensureShelfStockCovers`, par article ET unité). Un reste dans une autre
 * unité (article passé du poids à la pièce) ne couvrirait rien : il est tu.
 *
 * Pure : le reste lu et les articles servis suffisent. Le label du reçu ne
 * sort pas — le nom d'un article est celui du catalogue de l'appelant.
 */
export function shelfLeftFor(
  stock: readonly ShelfStockLeft[],
  served: ReadonlyMap<string, ShelfServedArticle>,
): readonly ShelfLeftLine[] {
  return stock.flatMap((line) => {
    const article = served.get(line.sku);
    if (article?.saleUnit !== line.saleUnit || line.estimatedStock <= 0) {
      return [];
    }
    return [{ sku: line.sku, saleUnit: line.saleUnit, left: line.estimatedStock }];
  });
}
