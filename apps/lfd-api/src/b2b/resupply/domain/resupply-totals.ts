import { stockKeyOf } from "./estimated-stock.js";
import type { SaleUnit } from "./resupply-sale-unit.js";

/** Une ligne à cumuler : ce que portent les lignes d'un réassort. */
export interface ResupplyQuantity {
  readonly sku: string;
  readonly label: string;
  readonly quantity: number;
  /** Des grammes si `weight` (L2b-1) : jamais cumulés avec des pièces. */
  readonly saleUnit: SaleUnit;
}

/**
 * **Le cumul par article** des réassorts d'une journée : ce que le fournil a
 * à produire, tous points confondus — par (article, unité). L'ordre est celui
 * de la première demande ; le libellé, celui de la première ligne qui l'a figé.
 */
export function resupplyTotals(
  lineGroups: readonly (readonly ResupplyQuantity[])[],
): readonly ResupplyQuantity[] {
  const totals = new Map<string, ResupplyQuantity>();
  for (const line of lineGroups.flat()) {
    const key = stockKeyOf(line.sku, line.saleUnit);
    const known = totals.get(key);
    totals.set(key, {
      sku: line.sku,
      label: known?.label ?? line.label,
      quantity: (known?.quantity ?? 0) + line.quantity,
      saleUnit: line.saleUnit,
    });
  }
  return [...totals.values()];
}
