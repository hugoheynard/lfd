import type { SaleUnit } from "./resupply-sale-unit.js";
import { StockTallies } from "./stock-tally.js";

/** Une ligne à cumuler : ce que portent les lignes d'un réassort. */
export interface ResupplyQuantity {
  readonly sku: string;
  readonly label: string;
  readonly quantity: number;
  /** Des grammes si `weight` (L2b-1) : jamais cumulés avec des pièces. */
  readonly saleUnit: SaleUnit;
}

interface QuantityTally {
  readonly sku: string;
  readonly saleUnit: SaleUnit;
  readonly label: string;
  quantity: number;
}

/**
 * **Le cumul par article** des réassorts d'une journée : ce que le fournil a
 * à produire, tous points confondus — par (article, unité). L'ordre est celui
 * de la première demande ; le libellé, celui de la première ligne qui l'a figé.
 */
export function resupplyTotals(
  lineGroups: readonly (readonly ResupplyQuantity[])[],
): readonly ResupplyQuantity[] {
  const tallies = new StockTallies<QuantityTally>((identity) => ({ ...identity, quantity: 0 }));
  for (const line of lineGroups.flat()) {
    tallies.of(line).quantity += line.quantity;
  }
  return tallies.values().map(({ sku, label, quantity, saleUnit }) => ({
    sku,
    label,
    quantity,
    saleUnit,
  }));
}
