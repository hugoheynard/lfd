import type {
  DeliveryLoadingPlanBinView,
  DeliveryLoadingPlanStackView,
  DeliveryLoadingRoundView,
} from '@lfd/contracts';

import { halfLabel, hasBinToRedo } from './delivery-loading';
import { stopHue } from './delivery-loading-floor';
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
  /** « M », « L » — le type, court, écrit dans chaque tuile. */
  readonly typeShort: string;
  /** La hauteur d'un bac de la pile, rapportée au type le plus haut du plan (0..1]. */
  readonly scale: number;
  readonly tiles: readonly StackTile[];
}

function column(
  stackIndex: number,
  binTypeName: string,
  tiles: readonly StackTile[],
  footer: string | null,
  scale: number,
): TileColumn {
  const loaded = tiles.filter((tile) => tile.loaded).length;
  return {
    stackIndex,
    header: `Pile ${String(stackIndex)} · ${binTypeName}`,
    fill: `${String(loaded)}/${String(tiles.length)}`,
    footer,
    typeShort: binTypeShort(binTypeName),
    scale,
    tiles,
  };
}

/** « Bac M » → « M », « Caisse iso » → « iso » : le dernier mot du type. */
export function binTypeShort(binTypeName: string): string {
  return binTypeName.trim().split(/\s+/u).at(-1) ?? binTypeName;
}

/**
 * La hauteur d'un bac rapportée au plus haut : 1 pour le plus haut, moins
 * pour les autres. Une hauteur inconnue (≤ 0) ne rétrécit rien.
 */
export function tileScale(heightCm: number, maxHeightCm: number): number {
  if (heightCm <= 0 || maxHeightCm <= 0) {
    return 1;
  }
  return Math.min(1, heightCm / maxHeightCm);
}

/**
 * L'échelle de chaque pile, rapportée au type le plus haut du PLAN — pas de la
 * rangée : deux rangées restent comparables d'un coup d'œil.
 */
export function stackScales(
  stacks: readonly Pick<DeliveryLoadingPlanStackView, 'stackIndex' | 'binTypeHeightCm'>[],
): ReadonlyMap<number, number> {
  const max = Math.max(0, ...stacks.map((stack) => stack.binTypeHeightCm));
  return new Map(stacks.map((stack) => [stack.stackIndex, tileScale(stack.binTypeHeightCm, max)]));
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
  scales: ReadonlyMap<number, number> = new Map(),
): readonly TileColumn[] {
  return row.stacks.map((stack, index) =>
    column(
      stack.stackIndex,
      stack.binTypeName,
      tiles.get(stack.stackIndex) ?? [],
      SIDE_FOOTER[stackSide(index, row.stacks.length)] ?? null,
      scales.get(stack.stackIndex) ?? 1,
    ),
  );
}

/** Les colonnes de piles sans place au sol, dans l'ordre d'ouverture. */
export function stackColumns(
  stacks: readonly DeliveryLoadingPlanStackView[],
  tiles: ReadonlyMap<number, readonly StackTile[]>,
  scales: ReadonlyMap<number, number> = new Map(),
): readonly TileColumn[] {
  return stacks.map((stack) =>
    column(
      stack.stackIndex,
      stack.binTypeName,
      tiles.get(stack.stackIndex) ?? [],
      null,
      scales.get(stack.stackIndex) ?? 1,
    ),
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
export function tileAriaLabel(
  tile: StackTile,
  state: TileState,
  canPick: boolean,
  binTypeName: string | null = null,
): string {
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
  const type = binTypeName === null ? '' : ` (${binTypeName}${tile.isotherm ? ', isotherme' : ''})`;
  return `${who}, ${kind} ${codes}${type}, ${what}`;
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

/** Une ligne de « Ce qui manque » au dépôt : l'arrêt, ses codes restants, et combien. */
export interface MissingStopRow {
  readonly stopId: string;
  readonly position: number;
  readonly hue: number;
  readonly customerLabel: string;
  /** Les codes encore à charger, en Mono : « H4N9QC · L5R2DE ». */
  readonly codes: string;
  /** « 2 à charger », « aucun bac déclaré », « bac partagé à refaire ». */
  readonly status: string;
}

/**
 * « Ce qui manque », arrêt par arrêt (SPEC §7) : les arrêts qui empêchent de
 * partir — pas chargés, ou portant un bac partagé à refaire —, dans l'ordre de
 * passage. Un arrêt complet disparaît.
 */
export function missingByStop(
  round: Pick<DeliveryLoadingRoundView, 'stops'>,
): readonly MissingStopRow[] {
  return round.stops
    .filter((stop) => stop.state !== 'loaded' || hasBinToRedo(stop))
    .map((stop) => {
      const left = stop.bins.filter((bin) => bin.loadedAt === null);
      let status = `${String(left.length)} à charger`;
      if (stop.bins.length === 0) {
        status = 'aucun bac déclaré';
      } else if (hasBinToRedo(stop)) {
        status = 'bac partagé à refaire';
      }
      return {
        stopId: stop.stopId,
        position: stop.position,
        hue: stopHue(stop.position),
        customerLabel: stop.customerLabel,
        codes: left.map((bin) => bin.code).join(' · '),
        status,
      };
    });
}
