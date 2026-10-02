import type { CargoFloor } from "../../value-objects/cargo-floor.js";
import { freeWidthCm } from "./floor-geometry.js";
import type { RowOrientation } from "./maximize-format.js";

/** Une pile telle que la stratégie B la lit : son empreinte extérieure, son froid. */
export interface StackToPlace {
  readonly stackIndex: number;
  readonly isotherm: boolean;
  readonly outerLengthCm: number;
  readonly outerWidthCm: number;
}

/** La pile est posée au sol : sa rangée, son coin côté fond-gauche, son empreinte. */
export interface FloorPlacement {
  readonly kind: "floor";
  /** 1..n, depuis le fond. */
  readonly row: number;
  /** Distance depuis le fond (la cloison). */
  readonly xCm: number;
  /** Distance depuis le flanc gauche, vu depuis les portes arrière. */
  readonly yCm: number;
  /** Empreinte EXTÉRIEURE le long du véhicule, sans le jeu. */
  readonly depthCm: number;
  /** Empreinte EXTÉRIEURE en travers, sans le jeu. */
  readonly widthCm: number;
  readonly orientation: RowOrientation;
}

/**
 * Où va une pile : au sol, dans la caisse réfrigérée (le froid reste en
 * litres, G-Q3), ou hors plancher — l'alerte `floor_over`.
 */
export type StackPlacement =
  FloorPlacement | { readonly kind: "refrigerated" } | { readonly kind: "off_floor" };

interface Print {
  readonly orientation: RowOrientation;
  /** Jeu compris. */
  readonly depthCm: number;
  readonly widthCm: number;
  readonly stack: StackToPlace;
}

interface OpenRow {
  readonly row: number;
  readonly fromCm: number;
  depthCm: number;
  usedWidthCm: number;
  readonly prints: Print[];
}

/**
 * **Stratégie B — poser ces piles dans l'ordre** (G-D4). Les piles arrivent
 * dans l'ordre de chargement (dernier arrêt d'abord) ; chacune se pose à
 * droite de la précédente dans la rangée ouverte, sinon ouvre une rangée plus
 * près des portes, sinon sort du plancher.
 *
 * - L'ordre n'est JAMAIS réordonné pour gagner de la place.
 * - Une rangée a la profondeur de sa pile la plus profonde ; chaque pile prend
 *   le sens qui laisse le plus de largeur (à égalité, dans la longueur), puis
 *   l'autre s'il est le seul à tenir.
 * - Au sol, aucune pile sur un passage de roue (`freeWidthCm`) ; une rangée
 *   qui touche les passages se centre entre eux.
 * - Dès qu'une pile sort, les suivantes sortent aussi : elles se chargent
 *   après elle, donc devant elle (décision par défaut du 2026-10-02).
 * - Le jeu s'ajoute à l'empreinte, comme dans la stratégie A.
 *
 * @param refrigerated le véhicule a une caisse réfrigérée : les isothermes y vont.
 */
export function placeStacks(
  floor: CargoFloor,
  stacks: readonly StackToPlace[],
  gapCm: number,
  refrigerated: boolean,
): ReadonlyMap<number, StackPlacement> {
  const placements = new Map<number, StackPlacement>();
  const rows: OpenRow[] = [];
  let blocked = false;
  for (const stack of stacks) {
    if (stack.isotherm && refrigerated) {
      placements.set(stack.stackIndex, { kind: "refrigerated" });
      continue;
    }
    blocked = blocked || !put(floor, rows, printsOf(stack, gapCm));
    if (blocked) {
      placements.set(stack.stackIndex, { kind: "off_floor" });
    }
  }
  for (const row of rows) {
    for (const [index, placement] of finalize(floor, row)) {
      placements.set(index, placement);
    }
  }
  return placements;
}

/** Le sens qui laisse le plus de largeur d'abord ; à égalité, dans la longueur. */
function printsOf(stack: StackToPlace, gapCm: number): readonly Print[] {
  const long = stack.outerLengthCm + gapCm;
  const wide = stack.outerWidthCm + gapCm;
  const length: Print = { orientation: "length", depthCm: long, widthCm: wide, stack };
  const turned: Print = { orientation: "turned", depthCm: wide, widthCm: long, stack };
  return turned.widthCm < length.widthCm ? [turned, length] : [length, turned];
}

/** Dans la rangée ouverte, sinon dans une rangée neuve ; `false` = hors plancher. */
function put(floor: CargoFloor, rows: OpenRow[], prints: readonly Print[]): boolean {
  const open = rows[rows.length - 1];
  if (open !== undefined) {
    for (const print of prints) {
      const depthCm = Math.max(open.depthCm, print.depthCm);
      if (fits(floor, open.fromCm, depthCm, open.usedWidthCm + print.widthCm)) {
        open.depthCm = depthCm;
        open.usedWidthCm += print.widthCm;
        open.prints.push(print);
        return true;
      }
    }
  }
  const fromCm = open === undefined ? 0 : open.fromCm + open.depthCm;
  for (const print of prints) {
    if (fits(floor, fromCm, print.depthCm, print.widthCm)) {
      rows.push({
        row: rows.length + 1,
        fromCm,
        depthCm: print.depthCm,
        usedWidthCm: print.widthCm,
        prints: [print],
      });
      return true;
    }
  }
  return false;
}

function fits(floor: CargoFloor, fromCm: number, depthCm: number, widthCm: number): boolean {
  return fromCm + depthCm <= floor.lengthCm && widthCm <= freeWidthCm(floor, fromCm, depthCm);
}

/** Les coordonnées, une fois la profondeur de la rangée connue : elle décide du passage. */
function finalize(floor: CargoFloor, row: OpenRow): ReadonlyMap<number, FloorPlacement> {
  const offsetCm = (floor.widthCm - freeWidthCm(floor, row.fromCm, row.depthCm)) / 2;
  const placements = new Map<number, FloorPlacement>();
  let yCm = offsetCm;
  for (const print of row.prints) {
    const turned = print.orientation === "turned";
    placements.set(print.stack.stackIndex, {
      kind: "floor",
      row: row.row,
      xCm: row.fromCm,
      yCm,
      depthCm: turned ? print.stack.outerWidthCm : print.stack.outerLengthCm,
      widthCm: turned ? print.stack.outerLengthCm : print.stack.outerWidthCm,
      orientation: print.orientation,
    });
    yCm += print.widthCm;
  }
  return placements;
}
