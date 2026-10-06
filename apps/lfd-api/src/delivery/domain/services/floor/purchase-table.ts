import type { CargoFloor } from "../../value-objects/cargo-floor.js";
import type { FormatGeometry } from "./format-geometry.js";
import { type FormatLayout, maximizeFormat } from "./maximize-format.js";
import { type PurchaseCost, purchaseCost } from "./purchase-cost.js";

/** Un véhicule en ligne : son plancher et son prix HT (`null` = inconnu). */
export interface PurchaseTableVehicle {
  readonly floor: CargoFloor;
  readonly priceCents: number | null;
}

/** Un format en colonne : sa géométrie (mm) et son prix unitaire HT (`null` = inconnu). */
export interface PurchaseTableFormat {
  readonly format: FormatGeometry;
  readonly unitPriceCents: number | null;
}

/** Une case : le rangement du format, sans le dessin des rangées, et ses coûts. */
export type PurchaseTableCell = Omit<FormatLayout, "rows"> & PurchaseCost;

/** L'index de la meilleure case pour chaque critère, `null` si aucune ne se classe. */
export interface PurchaseTableRowBest {
  readonly occupation: number | null;
  readonly volume: number | null;
  readonly costPerLiter: number | null;
}

/** Une ligne : le véhicule tel qu'on l'a donné, ses cases dans l'ordre des formats. */
export interface PurchaseTableRow<V extends PurchaseTableVehicle = PurchaseTableVehicle> {
  readonly vehicle: V;
  readonly cells: readonly PurchaseTableCell[];
  readonly best: PurchaseTableRowBest;
}

export interface PurchaseTable<V extends PurchaseTableVehicle = PurchaseTableVehicle> {
  readonly rows: readonly PurchaseTableRow<V>[];
  readonly bestRowByCostPerLiter: number | null;
}

/**
 * **Le tableau croisé** (B-D4) : chaque véhicule × chaque format par
 * `maximizeFormat`, tel quel — passages de roue et bacs au-dessus compris.
 *
 * **Les meilleures cases sont calculées ICI, pas à l'écran**, et c'est
 * délibéré : le classement porte des règles — une case vide ne gagne pas, un
 * coût inconnu ne se classe pas, l'égalité revient à la première colonne —
 * qui, laissées au front, se réécriraient à chaque écran qui lit le tableau
 * (B5, puis les scénarios de B3) et divergeraient. Le serveur rend les trois
 * index ; l'écran choisit seulement lequel mettre en avant.
 *
 * Occupation et volume désignent le plus souvent la même case (même véhicule,
 * même dénominateur) ; ils divergent quand l'occupation, arrondie au
 * pour-cent, fait une égalité que le volume tranche autrement — d'où deux
 * index plutôt qu'un.
 */
export function crossPurchaseTable<V extends PurchaseTableVehicle>(
  vehicles: readonly V[],
  formats: readonly PurchaseTableFormat[],
  gapCm: number,
): PurchaseTable<V> {
  const rows = vehicles.map((vehicle) => rowOf(vehicle, formats, gapCm));
  return {
    rows,
    bestRowByCostPerLiter: bestIndex(
      rows.map((row) => bestCostOf(row)),
      (a, b) => a < b,
    ),
  };
}

function rowOf<V extends PurchaseTableVehicle>(
  vehicle: V,
  formats: readonly PurchaseTableFormat[],
  gapCm: number,
): PurchaseTableRow<V> {
  const cells = formats.map(({ format, unitPriceCents }): PurchaseTableCell => {
    const { rows: _rows, ...layout } = maximizeFormat(vehicle.floor, format, gapCm);
    return {
      ...layout,
      ...purchaseCost({
        total: layout.total,
        usefulLiters: layout.usefulLiters,
        vehiclePriceCents: vehicle.priceCents,
        unitPriceCents,
      }),
    };
  });
  const more = (a: number, b: number): boolean => a > b;
  return {
    vehicle,
    cells,
    best: {
      occupation: bestIndex(
        cells.map((cell) => (cell.total > 0 ? cell.vehiclePercent : null)),
        more,
      ),
      volume: bestIndex(
        cells.map((cell) => (cell.usefulLiters > 0 ? cell.usefulLiters : null)),
        more,
      ),
      costPerLiter: bestIndex(
        cells.map((cell) => cell.costPerLiterCents),
        (a, b) => a < b,
      ),
    },
  };
}

function bestCostOf(row: PurchaseTableRow): number | null {
  const index = row.best.costPerLiter;
  return index === null ? null : (row.cells[index]?.costPerLiterCents ?? null);
}

/** L'index de la meilleure valeur non nulle ; à égalité, la première. */
function bestIndex(
  values: readonly (number | null)[],
  better: (a: number, b: number) => boolean,
): number | null {
  let best: number | null = null;
  let bestValue = 0;
  for (const [index, value] of values.entries()) {
    if (value !== null && (best === null || better(value, bestValue))) {
      best = index;
      bestValue = value;
    }
  }
  return best;
}
