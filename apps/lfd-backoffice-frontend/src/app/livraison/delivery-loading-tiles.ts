import type { DeliveryLoadingPlanBinView, DeliveryLoadingPlanStackView } from '@lfd/contracts';

import { halfLabel } from './delivery-loading';
import { type FloorRow, rowPlace, type StackTile, stackSide } from './delivery-loading-rows';

/**
 * **Les piles telles qu'on les dessine à l'écran « Charger »** — des colonnes
 * de tuiles, et ce qu'on en dit à voix haute. Dérivations pures : les
 * composants ne font que rendre.
 */

/** Une colonne : une pile, ses tuiles du bas vers le haut. */
export interface TileColumn {
  readonly stackIndex: number;
  /** « Pile 1 · Bac M ». */
  readonly header: string;
  /** « 2/3 » : tuiles chargées sur tuiles de la pile. */
  readonly fill: string;
  /** « côté gauche », « côté droit » — `null` hors plancher. */
  readonly footer: string | null;
  readonly tiles: readonly StackTile[];
}

function column(
  stackIndex: number,
  binTypeName: string,
  tiles: readonly StackTile[],
  footer: string | null,
): TileColumn {
  const loaded = tiles.filter((tile) => tile.loaded).length;
  return {
    stackIndex,
    header: `Pile ${String(stackIndex)} · ${binTypeName}`,
    fill: `${String(loaded)}/${String(tiles.length)}`,
    footer,
    tiles,
  };
}

/** Le pied d'une colonne selon sa place dans la rangée. */
const SIDE_FOOTER: Readonly<Record<string, string>> = {
  'à gauche': 'côté gauche',
  'au milieu': 'au milieu',
  'à droite': 'côté droit',
};

/** Les colonnes d'une rangée du plancher, de gauche à droite vu des portes. */
export function rowColumns(
  row: FloorRow,
  tiles: ReadonlyMap<number, readonly StackTile[]>,
): readonly TileColumn[] {
  return row.stacks.map((stack, index) =>
    column(
      stack.stackIndex,
      stack.binTypeName,
      tiles.get(stack.stackIndex) ?? [],
      SIDE_FOOTER[stackSide(index, row.stacks.length)] ?? null,
    ),
  );
}

/** Les colonnes de piles sans place au sol, dans l'ordre d'ouverture. */
export function stackColumns(
  stacks: readonly DeliveryLoadingPlanStackView[],
  tiles: ReadonlyMap<number, readonly StackTile[]>,
): readonly TileColumn[] {
  return stacks.map((stack) =>
    column(stack.stackIndex, stack.binTypeName, tiles.get(stack.stackIndex) ?? [], null),
  );
}

/** « Rangée 1 · le fond ». */
export function rowTitle(row: number, rowCount: number): string {
  return `Rangée ${String(row)} · ${rowPlace(row, rowCount)}`;
}

/** « R1 · Fond » — le nom court d'un onglet de rangée. */
export function rowTabLabel(row: number, rowCount: number): string {
  const place = rowPlace(row, rowCount).replace(/^(le |au |les )/u, '');
  return `R${String(row)} · ${place.charAt(0).toUpperCase()}${place.slice(1)}`;
}

/** L'état d'une tuile, tel que le dessin le marque : pointillé, plein, cerclé. */
export type TileState = 'pending' | 'loaded' | 'next';

export function tileState(tile: StackTile, nextKey: string | null): TileState {
  if (nextKey !== null && tile.bins.some((bin) => bin.key === nextKey)) {
    return 'next';
  }
  return tile.loaded ? 'loaded' : 'pending';
}

/**
 * « Arrêt 5, bac H4N9QC, à poser maintenant » — tout ce que la tuile dit en
 * couleur et en forme, dit en mots.
 */
export function tileAriaLabel(tile: StackTile, state: TileState, canPick: boolean): string {
  const stops = tile.stopPositions.map(String).join('·');
  const who = `${tile.stopPositions.length > 1 ? 'Arrêts' : 'Arrêt'} ${stops}`;
  let kind = tile.half ? 'demi-bac' : 'bac';
  if (tile.shared) {
    kind = 'bac partagé';
  }
  const codes = tile.bins.map((bin) => bin.code).join(' · ');
  let what = canPick ? 'chargé — toucher pour le décharger' : 'chargé';
  if (state === 'next') {
    what = 'à poser maintenant';
  } else if (state === 'pending') {
    what = canPick ? 'à charger — toucher pour le désigner comme prochain' : 'à charger';
  }
  return `${who}, ${kind} ${codes}, ${what}`;
}

/** Un onglet du sélecteur de rangée : son nom, son avancement, sa mini-carte. */
export interface RowTab {
  readonly row: number;
  readonly label: string;
  /** « 4/5 », ou « ✓ » quand la rangée est chargée. */
  readonly progress: string;
  readonly done: boolean;
  readonly marks: readonly { readonly key: string; readonly state: TileState }[];
}

/** Les onglets, du fond vers les portes. */
export function rowTabs(
  rows: readonly FloorRow[],
  tiles: ReadonlyMap<number, readonly StackTile[]>,
  nextKey: string | null,
): readonly RowTab[] {
  const rowCount = rows.at(-1)?.row ?? 0;
  return rows.map((row) => {
    const rowTiles = row.stacks.flatMap((stack) => tiles.get(stack.stackIndex) ?? []);
    const loaded = rowTiles.filter((tile) => tile.loaded).length;
    const done = rowTiles.length > 0 && loaded === rowTiles.length;
    return {
      row: row.row,
      label: rowTabLabel(row.row, rowCount),
      progress: done ? '✓' : `${String(loaded)}/${String(rowTiles.length)}`,
      done,
      marks: rowTiles.map((tile) => ({ key: tile.key, state: tileState(tile, nextKey) })),
    };
  });
}

/** Ce que dit le badge de la carte « À poser maintenant » : le type, la moitié, le partage. */
export function nextBinBadge(
  bin: Pick<
    DeliveryLoadingPlanBinView,
    'binTypeName' | 'half' | 'sharedWithReference' | 'isotherm'
  >,
): string {
  if (bin.isotherm) {
    return 'Isotherme ❄';
  }
  const half = halfLabel(bin.half);
  const base = half === null ? bin.binTypeName : `${bin.binTypeName} · ${half}`;
  return bin.sharedWithReference === null
    ? base
    : `${base} · partagé avec ${bin.sharedWithReference}`;
}
