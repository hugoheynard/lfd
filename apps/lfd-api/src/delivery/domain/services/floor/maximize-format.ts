import { FloorLayoutIndexError } from "../../errors/delivery-floor-errors.js";
import type { BinFormat } from "../../value-objects/bin-format.js";
import type { CargoFloor } from "../../value-objects/cargo-floor.js";
import { freeWidthCm, stackLevels } from "./floor-geometry.js";

/** Le bac debout, sa longueur dans celle du véhicule (`length`) ou tourné (`turned`). */
export type RowOrientation = "length" | "turned";

/** Ce qui arrête la pile : `maxStack` (`stack`) ou le plafond (`ceiling`). */
export type HeightLimit = "stack" | "ceiling";

/** Une rangée transversale, pour dessiner le plancher. */
export interface FloorRow {
  /** Début de la rangée, depuis le fond. */
  readonly fromCm: number;
  /** Profondeur occupée, jeu compris. */
  readonly depthCm: number;
  readonly count: number;
  readonly orientation: RowOrientation;
}

/** Le meilleur rangement par rangées d'un format. */
export interface FormatLayout {
  readonly floorCount: number;
  readonly levels: number;
  readonly total: number;
  /** Volume INTÉRIEUR des bacs posés, litres arrondis à l'inférieur. */
  readonly usefulLiters: number;
  /** Part du volume du véhicule, pourcentage entier arrondi à l'inférieur. */
  readonly vehiclePercent: number;
  readonly heightLimit: HeightLimit;
  readonly rows: readonly FloorRow[];
}

const CM3_PER_LITER = 1000;
const PERCENT = 100;

interface Footprint {
  readonly orientation: RowOrientation;
  readonly depthCm: number;
  readonly widthCm: number;
}

/** Ce que f(x) retient : sa valeur, et la rangée posée en x (ou `null` = 1 cm vide). */
interface Step {
  readonly value: number;
  readonly row: FloorRow | null;
}

/**
 * **Stratégie A — maximiser un format** (G-D3) : le plus de bacs identiques,
 * par rangées transversales, chacune dans son meilleur sens.
 *
 * `f(x)` = bacs au sol posables depuis `x` (cm entiers, depuis le fond) ;
 * `f(L) = 0` ; `f(x) = max(f(x + 1), ⌊freeWidth(x, d) ÷ w⌋ + f(x + d))` pour
 * chaque sens. Le jeu s'ajoute à l'empreinte, en long comme en large.
 *
 * Exact **parmi les rangements par rangées**, pas parmi tous : un rangement
 * « en moulinet » peut battre une rangée sur certains planchers. À égalité,
 * poser une rangée l'emporte sur laisser un centimètre, et le sens `length`
 * sur `turned` — le rendu est déterministe.
 */
export function maximizeFormat(floor: CargoFloor, format: BinFormat, gapCm: number): FormatLayout {
  const rows = bestRows(floor, footprintsOf(format, gapCm));
  const floorCount = rows.reduce((sum, row) => sum + row.count, 0);
  const ceilingLevels = Math.floor(floor.heightCm / format.outer.heightCm);
  const levels = stackLevels(floor, format.outer.heightCm, format.maxStack);
  const total = floorCount * levels;
  const innerCm3 = total * format.inner.lengthCm * format.inner.widthCm * format.inner.heightCm;
  const vehicleCm3 = floor.lengthCm * floor.widthCm * floor.heightCm;
  return {
    floorCount,
    levels,
    total,
    usefulLiters: Math.floor(innerCm3 / CM3_PER_LITER),
    vehiclePercent: Math.floor((innerCm3 * PERCENT) / vehicleCm3),
    heightLimit: format.maxStack <= ceilingLevels ? "stack" : "ceiling",
    rows,
  };
}

function footprintsOf(format: BinFormat, gapCm: number): readonly Footprint[] {
  const long = format.outer.lengthCm + gapCm;
  const wide = format.outer.widthCm + gapCm;
  return [
    { orientation: "length", depthCm: long, widthCm: wide },
    { orientation: "turned", depthCm: wide, widthCm: long },
  ];
}

/** Remonte f depuis les portes, puis relit les rangées choisies depuis le fond. */
function bestRows(floor: CargoFloor, footprints: readonly Footprint[]): readonly FloorRow[] {
  const length = floor.lengthCm;
  const steps: Step[] = new Array<Step>(length + 1);
  steps[length] = { value: 0, row: null };
  for (let x = length - 1; x >= 0; x -= 1) {
    steps[x] = stepAt(floor, footprints, steps, x);
  }
  const rows: FloorRow[] = [];
  let x = 0;
  while (x < length) {
    const { row } = stepOf(steps, x);
    if (row === null) {
      x += 1;
    } else {
      rows.push(row);
      x += row.depthCm;
    }
  }
  return rows;
}

function stepAt(
  floor: CargoFloor,
  footprints: readonly Footprint[],
  steps: readonly Step[],
  x: number,
): Step {
  let best: Step = { value: stepOf(steps, x + 1).value, row: null };
  for (const print of footprints) {
    if (x + print.depthCm > floor.lengthCm) {
      continue;
    }
    const count = Math.floor(freeWidthCm(floor, x, print.depthCm) / print.widthCm);
    const value = count + stepOf(steps, x + print.depthCm).value;
    const beats = best.row === null ? value >= best.value : value > best.value;
    if (count > 0 && beats) {
      const row = { fromCm: x, depthCm: print.depthCm, count, orientation: print.orientation };
      best = { value, row };
    }
  }
  return best;
}

/** Une case remplie par construction ; son absence serait un bogue d'indice. */
function stepOf(steps: readonly Step[], x: number): Step {
  const step = steps[x];
  if (step === undefined) {
    throw new FloorLayoutIndexError(x);
  }
  return step;
}
