import type { ResupplyArticleView } from '@lfd/contracts';

import { resupplyLinesAmountLabel } from '../../../shared/resupply-labels';

/** Une ligne qui part avec le réassort : un article et sa quantité positive. */
export interface BakehouseLine {
  readonly sku: string;
  readonly quantity: number;
}

/** Les articles à quantité positive, dans l'ordre du catalogue. */
export function requestedLines(
  articles: readonly ResupplyArticleView[],
  quantities: ReadonlyMap<string, number>,
): BakehouseLine[] {
  return articles
    .filter((article) => (quantities.get(article.sku) ?? 0) > 0)
    .map((article) => ({ sku: article.sku, quantity: quantities.get(article.sku) ?? 0 }));
}

/**
 * Ce qui part : les pièces ne comptent que les pièces, le poids se dit à
 * part — « 12 pièces · 1,25 kg » (lot L2b-4). Un article inconnu du
 * catalogue compte comme une pièce.
 */
export function requestedAmountLabel(
  articles: readonly ResupplyArticleView[],
  lines: readonly BakehouseLine[],
): string {
  const units = new Map(articles.map((article) => [article.sku, article.saleUnit] as const));
  return resupplyLinesAmountLabel(
    lines.map((line) => ({ quantity: line.quantity, saleUnit: units.get(line.sku) ?? 'piece' })),
  );
}

/** La case réécrite : vidée ou à zéro, l'article n'est plus demandé. */
export function withQuantity(
  quantities: ReadonlyMap<string, number>,
  sku: string,
  quantity: number | null,
): ReadonlyMap<string, number> {
  const next = new Map(quantities);
  if (quantity === null || quantity <= 0) {
    next.delete(sku);
  } else {
    next.set(sku, quantity);
  }
  return next;
}
