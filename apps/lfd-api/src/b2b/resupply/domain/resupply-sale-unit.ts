import type { SaleUnit } from "@lfd/money";

import { UnknownResupplySaleUnitError } from "./resupply-sale-unit-errors.js";

export type { SaleUnit } from "@lfd/money";

/**
 * L'unité d'une ligne de réassort relue en base (`sale_unit`, TEXT contraint
 * `piece` | `weight`, lot L2b-1 du plan du jour J). Aucun repli sur la pièce :
 * des grammes lus en pièces compteraient mille fois le stock.
 *
 * @throws {UnknownResupplySaleUnitError} valeur hors de la contrainte.
 */
export function resupplySaleUnitOf(sku: string, value: string): SaleUnit {
  if (value === "piece" || value === "weight") {
    return value;
  }
  throw new UnknownResupplySaleUnitError(sku, value);
}
