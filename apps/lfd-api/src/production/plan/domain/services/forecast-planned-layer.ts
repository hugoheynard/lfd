import { pieceTally, saleQuantity } from "@lfd/money";

import type {
  DayResupplyDemand,
  ForecastColumn,
  ForecastMatrix,
  ForecastRow,
} from "./production-forecast.js";

/** Une colonne, avec ce que les brouillons y pèsent à part. */
export interface PlannedForecastColumn extends ForecastColumn {
  /** Des pièces : un article au poids y compte pour un. Jamais dans `totalUnits`. */
  readonly plannedUnits: number;
}

/** Une ligne, avec ce que les brouillons y pèsent à part, colonne par colonne. */
export interface PlannedForecastRow extends ForecastRow {
  /** Même longueur que les colonnes. Jamais dans `quantities` ni `totalUnits`. */
  readonly plannedQuantities: readonly number[];
}

/** La matrice, augmentée de la couche « planifié, non commandé ». */
export interface PlannedForecastMatrix {
  readonly columns: readonly PlannedForecastColumn[];
  readonly rows: readonly PlannedForecastRow[];
  readonly peakDate: string | null;
  readonly totalUnits: number;
}

/**
 * **La couche « planifié, non commandé »** posée sur la matrice, sans la
 * toucher : les brouillons du planificateur des pros se lisent à côté de la
 * demande, jamais dedans. Totaux, pic, compte de commandes et quantités
 * sortent tels que la matrice les a calculés — un brouillon ne se fabrique
 * qu'en devenant une commande.
 *
 * Une journée **arrêtée** ne porte pas la couche (`0`) : son compte est figé
 * et c'est lui qu'on fabrique. Un article seulement planifié gagne sa ligne,
 * à zéro dans la demande, et les lignes restent triées par SKU.
 */
export function withPlannedLayer(
  matrix: ForecastMatrix,
  planned: readonly DayResupplyDemand[],
): PlannedForecastMatrix {
  const width = matrix.columns.length;
  const columnOf = new Map(matrix.columns.map((column, index) => [column.date, index]));
  const layer = new Map<string, number[]>();
  const known = new Map(matrix.rows.map((row) => [row.sku, row]));
  const added = new Map<string, ForecastRow>();
  const units = zeros(width);
  for (const day of planned) {
    const index = columnOf.get(day.day);
    if (index === undefined || matrix.columns[index]?.closed === true) {
      continue;
    }
    for (const item of day.items) {
      const quantities = layer.get(item.sku) ?? zeros(width);
      quantities[index] = (quantities[index] ?? 0) + item.quantity;
      layer.set(item.sku, quantities);
      units[index] = (units[index] ?? 0) + pieceTally(saleQuantity(item.quantity, item.saleUnit));
      if (!known.has(item.sku) && !added.has(item.sku)) {
        added.set(item.sku, emptyRow(item.sku, item.productName, item.saleUnit, width));
      }
    }
  }
  const rows = [...matrix.rows, ...added.values()]
    .sort((left, right) => left.sku.localeCompare(right.sku))
    .map((row) => ({ ...row, plannedQuantities: layer.get(row.sku) ?? zeros(width) }));
  return {
    columns: matrix.columns.map((column, index) => ({
      ...column,
      plannedUnits: units[index] ?? 0,
    })),
    rows,
    peakDate: matrix.peakDate,
    totalUnits: matrix.totalUnits,
  };
}

function emptyRow(
  sku: string,
  productName: string,
  saleUnit: ForecastRow["saleUnit"],
  width: number,
): ForecastRow {
  return {
    sku,
    productName,
    saleUnit,
    quantities: zeros(width),
    resupplyQuantities: zeros(width),
    totalUnits: 0,
  };
}

function zeros(width: number): number[] {
  return Array.from({ length: width }, () => 0);
}
