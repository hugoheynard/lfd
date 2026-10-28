import { pieceTally, saleQuantity, type SaleUnit } from "@lfd/money";

/**
 * Le plus gros d'abord ; à égalité, le nom, puis le SKU — jamais l'ordre
 * d'arrivée. Un article au poids pèse une pièce dans ce tri (P6) : 1 250 g ne
 * passent pas devant 48 croissants.
 */
export function byWeightThenName(left: SortedEntry, right: SortedEntry): number {
  return (
    loadOf(right) - loadOf(left) ||
    left.productName.localeCompare(right.productName) ||
    left.sku.localeCompare(right.sku)
  );
}

export interface SortedEntry {
  readonly quantity?: number;
  readonly to?: number;
  readonly saleUnit: SaleUnit;
  readonly productName: string;
  readonly sku: string;
}

function loadOf(entry: SortedEntry): number {
  return pieceTally(saleQuantity(entry.quantity ?? entry.to ?? 0, entry.saleUnit));
}
