import { FloorLayoutIndexError } from "../../errors/delivery-floor-errors.js";
import { MM_PER_CM } from "../../value-objects/bin-type-dimensions.js";
import type { CargoFloor } from "../../value-objects/cargo-floor.js";
import {
  type FloorMm,
  floorInMm,
  freeWidthMm,
  type OverArchLevels,
  overArchLevels,
  stackLevels,
} from "./floor-geometry.js";
import type { FormatGeometry } from "./format-geometry.js";

/** Le bac debout, sa longueur dans celle du véhicule (`length`) ou tourné (`turned`). */
export type RowOrientation = "length" | "turned";

/** Ce qui arrête la pile : `maxStack` (`stack`) ou le plafond (`ceiling`). */
export type HeightLimit = "stack" | "ceiling";

/** Une rangée transversale, pour dessiner le plancher — en millimètres. */
export interface FloorRow {
  /** Début de la rangée, depuis le fond. */
  readonly fromMm: number;
  /** Profondeur occupée, jeu compris. */
  readonly depthMm: number;
  /** Bacs en travers AU SOL (la largeur réduite si la rangée touche un passage). */
  readonly count: number;
  readonly orientation: RowOrientation;
  /**
   * Bacs en travers AU-DESSUS des passages, portés par la colonne centrale
   * (G-D2 bis) : `n_plein − n_réduit`, ou 0 si la hauteur du passage est
   * inconnue, si la rangée ne le touche pas, ou si aucun étage n'est libre.
   */
  readonly overArchCount: number;
  /**
   * Étage où commencent ces bacs latéraux, `k₀ = ⌈hauteur du passage ÷ hauteur
   * extérieure⌉` (0 = le sol) ; `null` quand `overArchCount` vaut 0.
   */
  readonly overArchFromLevel: number | null;
  /** Bacs de la rangée, tous étages : `count × étages + overArchCount × (étages − k₀)`. */
  readonly total: number;
}

/** Le meilleur rangement par rangées d'un format. */
export interface FormatLayout {
  /** Bacs posés AU SOL. */
  readonly floorCount: number;
  /** Étages des colonnes centrales. */
  readonly levels: number;
  /**
   * Somme des `total` de rangées. N'est plus `floorCount × levels` dès que des
   * bacs latéraux montent au-dessus d'un passage (G-D2 bis).
   */
  readonly total: number;
  /** Volume INTÉRIEUR des bacs posés, litres arrondis à l'inférieur. */
  readonly usefulLiters: number;
  /** Part du volume du véhicule, pourcentage entier arrondi à l'inférieur. */
  readonly vehiclePercent: number;
  readonly heightLimit: HeightLimit;
  readonly rows: readonly FloorRow[];
}

const MM3_PER_LITER = 1_000_000;
const PERCENT = 100;

interface Footprint {
  readonly orientation: RowOrientation;
  readonly depthMm: number;
  readonly widthMm: number;
}

/** Ce que f(x) retient : ses deux valeurs, et la rangée posée en x (ou `null` = 1 mm vide). */
interface Step {
  /** Bacs tous étages depuis x — ce que la dynamique maximise d'abord. */
  readonly total: number;
  /** Bacs au sol depuis x — le départage (sans étage, le total est nul partout). */
  readonly floor: number;
  readonly row: FloorRow | null;
}

/** Ce qui ne change pas d'une rangée à l'autre. */
interface Stacking {
  readonly levels: number;
  /** `k₀` et `étages − k₀`, ou `null` : rien ne monte au-dessus des passages. */
  readonly overArch: OverArchLevels | null;
}

/**
 * **Stratégie A — maximiser un format** (G-D3) : le plus de bacs identiques,
 * par rangées transversales, chacune dans son meilleur sens.
 *
 * `f(x)` = bacs au sol posables depuis `x` (mm entiers, depuis le fond —
 * un type de bac se mesure au millimètre, le plancher se convertit ×10) ;
 * `f(L) = 0` ; `f(x) = max(f(x + 1), ⌊freeWidth(x, d) ÷ w⌋ + f(x + d))` pour
 * chaque sens. Le jeu s'ajoute à l'empreinte, en long comme en large — pas à
 * la hauteur.
 *
 * **Par-dessus les passages** (G-D2 bis) : quand leur hauteur est connue, une
 * rangée qui les touche compte `n_réduit × étages + (n_plein − n_réduit) ×
 * max(0, étages − k₀)`. La dynamique maximise alors le TOTAL tous étages, puis
 * les bacs au sol. Sans hauteur, aucun bac latéral : le résultat d'avant.
 * Une rangée sans colonne centrale (0 au sol) ne porte rien au-dessus.
 * Hypothèse retenue : la colonne centrale tient l'ensemble — ni recouvrement
 * minimal ni poids vérifiés.
 *
 * Exact **parmi les rangements par rangées**, pas parmi tous : un rangement
 * « en moulinet » peut battre une rangée sur certains planchers. À égalité,
 * poser une rangée l'emporte sur laisser un millimètre, et le sens `length`
 * sur `turned` — le rendu est déterministe.
 */
export function maximizeFormat(
  cargoFloor: CargoFloor,
  format: FormatGeometry,
  gapCm: number,
): FormatLayout {
  const floor = floorInMm(cargoFloor);
  const levels = stackLevels(floor, format.outer.heightMm, format.maxStack);
  const stacking = { levels, overArch: overArchLevels(floor, format.outer.heightMm, levels) };
  const rows = bestRows(floor, footprintsOf(format, gapCm * MM_PER_CM), stacking);
  const floorCount = rows.reduce((sum, row) => sum + row.count, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const ceilingLevels = Math.floor(floor.heightMm / format.outer.heightMm);
  const innerMm3 = total * format.inner.lengthMm * format.inner.widthMm * format.inner.heightMm;
  const vehicleMm3 = floor.lengthMm * floor.widthMm * floor.heightMm;
  return {
    floorCount,
    levels,
    total,
    usefulLiters: Math.floor(innerMm3 / MM3_PER_LITER),
    vehiclePercent: Math.floor((innerMm3 * PERCENT) / vehicleMm3),
    heightLimit: format.maxStack <= ceilingLevels ? "stack" : "ceiling",
    rows,
  };
}

function footprintsOf(format: FormatGeometry, gapMm: number): readonly Footprint[] {
  const long = format.outer.lengthMm + gapMm;
  const wide = format.outer.widthMm + gapMm;
  return [
    { orientation: "length", depthMm: long, widthMm: wide },
    { orientation: "turned", depthMm: wide, widthMm: long },
  ];
}

/** Remonte f depuis les portes, puis relit les rangées choisies depuis le fond. */
function bestRows(
  floor: FloorMm,
  footprints: readonly Footprint[],
  stacking: Stacking,
): readonly FloorRow[] {
  const length = floor.lengthMm;
  const steps: Step[] = new Array<Step>(length + 1);
  steps[length] = { total: 0, floor: 0, row: null };
  for (let x = length - 1; x >= 0; x -= 1) {
    steps[x] = stepAt(floor, footprints, stacking, steps, x);
  }
  const rows: FloorRow[] = [];
  let x = 0;
  while (x < length) {
    const { row } = stepOf(steps, x);
    if (row === null) {
      x += 1;
    } else {
      rows.push(row);
      x += row.depthMm;
    }
  }
  return rows;
}

function stepAt(
  floor: FloorMm,
  footprints: readonly Footprint[],
  stacking: Stacking,
  steps: readonly Step[],
  x: number,
): Step {
  const skip = stepOf(steps, x + 1);
  let best: Step = { total: skip.total, floor: skip.floor, row: null };
  for (const print of footprints) {
    if (x + print.depthMm > floor.lengthMm) {
      continue;
    }
    const row = rowAt(floor, print, stacking, x);
    const next = stepOf(steps, x + print.depthMm);
    const candidate = { total: row.total + next.total, floor: row.count + next.floor, row };
    if (row.count > 0 && beats(candidate, best)) {
      best = candidate;
    }
  }
  return best;
}

/** À égalité, poser l'emporte sur laisser 1 mm ; le premier sens sur le second. */
function beats(candidate: Step, best: Step): boolean {
  if (candidate.total !== best.total) {
    return candidate.total > best.total;
  }
  if (candidate.floor !== best.floor) {
    return candidate.floor > best.floor;
  }
  return best.row === null;
}

/** La rangée posée en x dans ce sens : au sol, puis au-dessus des passages. */
function rowAt(floor: FloorMm, print: Footprint, stacking: Stacking, x: number): FloorRow {
  const count = Math.floor(freeWidthMm(floor, x, print.depthMm) / print.widthMm);
  const fullCount = Math.floor(floor.widthMm / print.widthMm);
  const upperLevels = stacking.overArch?.levels ?? 0;
  const overArchCount = upperLevels > 0 && count > 0 ? fullCount - count : 0;
  return {
    fromMm: x,
    depthMm: print.depthMm,
    count,
    orientation: print.orientation,
    overArchCount,
    overArchFromLevel: overArchCount > 0 ? (stacking.overArch?.fromLevel ?? null) : null,
    total: count * stacking.levels + overArchCount * upperLevels,
  };
}

/** Une case remplie par construction ; son absence serait un bogue d'indice. */
function stepOf(steps: readonly Step[], x: number): Step {
  const step = steps[x];
  if (step === undefined) {
    throw new FloorLayoutIndexError(x);
  }
  return step;
}
