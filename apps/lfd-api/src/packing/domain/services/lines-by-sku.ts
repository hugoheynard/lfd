/** Une ligne à coliser : l'article, son nom, la quantité due. */
export interface DueLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/**
 * **Une ligne par article** : les lignes d'un même SKU d'une commande,
 * additionnées. L'ombre range une ligne par (commande × article) ; deux lignes
 * du même croissant sur un bon sont un seul geste au bac.
 *
 * Le nom retenu est celui de la première ligne, comme le compte à produire du
 * fournil (`countOf`) : c'est le SKU qui fait foi.
 */
export function linesBySku(lines: readonly DueLine[]): readonly DueLine[] {
  const bySku = new Map<string, DueLine>();
  for (const line of lines) {
    const known = bySku.get(line.sku);
    bySku.set(line.sku, {
      sku: line.sku,
      productName: known?.productName ?? line.productName,
      quantity: (known?.quantity ?? 0) + line.quantity,
    });
  }
  return [...bySku.values()];
}
