import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import type { CatalogItemView } from '@lfd/contracts';

import type { SlotState } from '../fiche-atelier/workshop-deadlines';
import type { TrancheCell, TrancheColumn, TrancheGrid, TrancheRow } from './day-tranche-matrix';
import type { ForecastColumn, ForecastColumnTone, ForecastFootRow } from './forecast-column';
import {
  type ForecastCell,
  type ForecastProduct,
  type ForecastRayon,
  shelvedRayons,
} from './previsionnel-matrix';

/**
 * **La journée par tranche, dans la table du prévisionnel** (Hugo,
 * 2026-11-01) — les fabriques qui traduisent `dayTrancheGrid` en colonnes,
 * pied et rayons de `ForecastTable`. Les nombres restent ceux de
 * `day-tranche-matrix.ts` ; ici, on ne fait que les poser.
 *
 * Fonctions pures. `withState` dit si la journée a un « maintenant » à
 * montrer : le jour même pour les en-têtes, le jour même ou passé pour les
 * cases ; un jour à venir n'a que des quantités.
 */

/** L'état d'une tranche, dessiné par la surcouche de colonne qui dit la même chose. */
function toneOf(state: SlotState | null): ForecastColumnTone | null {
  switch (state) {
    case 'over':
      return 'overdue';
    case 'next':
      return 'current';
    case 'met':
      return 'past';
    case 'upcoming':
    case null:
      return null;
  }
}

/** Une charge de pied : un zéro est une case vide. */
function piecesFigure(pieces: number): string {
  return pieces === 0 ? '' : String(pieces);
}

function gramsFigure(grams: number): string {
  return grams === 0 ? '' : saleQuantityLabel(grams, 'weight');
}

/**
 * Le pied : la charge en pièces, le poids à part (jamais additionnés), et la
 * part des réassorts — chacun seulement s'il y a de quoi.
 */
export function trancheFootRows(grid: TrancheGrid): readonly ForecastFootRow[] {
  return [
    { key: 'pieces', label: 'Charge (pièces)', kind: 'total' as const },
    ...(grid.total.grams > 0
      ? [{ key: 'weight', label: 'Au poids', kind: 'detail' as const }]
      : []),
    ...(grid.total.resupply > 0
      ? [{ key: 'resupplies', label: 'dont réassorts', kind: 'resupplies' as const }]
      : []),
  ];
}

/**
 * Les colonnes-tranches, dans l'ordre des heures, « Sans heure » en dernier.
 * Une tranche est un fait quand le plan de la journée est arrêté
 * (`planClosed`) ; `null` = on ne sait pas, et la table ne l'atténue pas.
 */
export function trancheColumns(
  grid: TrancheGrid,
  withState: boolean,
  planClosed: boolean | null,
): readonly ForecastColumn[] {
  return grid.columns.map((column: TrancheColumn, index) => {
    const load = grid.loads[index] ?? { pieces: 0, grams: 0, resupply: 0 };
    const figure = [piecesFigure(load.pieces), gramsFigure(load.grams)]
      .filter((part) => part !== '')
      .join(' · ');
    return {
      key: column.key,
      overline: null,
      title: column.label,
      subtitle: column.subtitle,
      figure,
      mention: withState ? column.stateLabel : null,
      settled: planClosed !== false,
      peak: false,
      tone: withState ? toneOf(column.state) : null,
      foot: [
        piecesFigure(load.pieces),
        ...(grid.total.grams > 0 ? [gramsFigure(load.grams)] : []),
        ...(grid.total.resupply > 0 ? [piecesFigure(load.resupply)] : []),
      ],
    };
  });
}

function cellOf(
  cell: TrancheCell | null,
  unit: TrancheRow['saleUnit'],
  withState: boolean,
): ForecastCell {
  if (cell === null) {
    return EMPTY_CELL;
  }
  const result: ForecastCell = {
    quantity: cell.quantity,
    label: cell.label,
    // Le total de rayon suit la règle de la matrice : des pièces, une par case au poids.
    pieces: unit === 'weight' ? 1 : cell.quantity,
    exceptional: false,
    resupply: cell.resupply,
    notes: cell.beforeFirst === null ? [] : [cell.beforeFirst],
  };
  return cell.progress === null
    ? result
    : {
        ...result,
        progress: {
          label: cell.progress,
          state: withState ? cell.state : null,
          stateLabel: withState ? cell.stateLabel : null,
        },
      };
}

const EMPTY_CELL: ForecastCell = {
  quantity: 0,
  label: '',
  pieces: 0,
  exceptional: false,
  resupply: 0,
};

/**
 * Les lignes de la grille — tous les produits du prévisionnel ce jour-là —,
 * rangées comme la matrice : mêmes rayons, même ordre, mêmes intertitres.
 */
export function trancheRayons(
  grid: TrancheGrid,
  catalogue: readonly CatalogItemView[],
  shelvesKnown: boolean,
  showSubcategories: boolean,
  /** Le jour même, fiche lue : l'état de chaque case. Ailleurs, le compte seul. */
  withState: boolean,
): readonly ForecastRayon[] {
  const products: ForecastProduct[] = grid.rows.map((row) => {
    const cells = row.cells.map((cell) => cellOf(cell, row.saleUnit, withState));
    const product: ForecastProduct = {
      sku: row.sku,
      productName: row.productName,
      saleUnit: row.saleUnit,
      cells,
      totalUnits: row.total,
    };
    return row.mismatch === null ? product : { ...product, warning: row.mismatch };
  });
  return shelvedRayons(products, grid.columns.length, catalogue, shelvesKnown, showSubcategories);
}
