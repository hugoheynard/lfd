import { type FloorMm, freeWidthMm, type OverArchLevels } from "./floor-geometry.js";
import type { RowOrientation } from "./maximize-format.js";

/** Le passage de roue sous une pile : celui du flanc gauche ou du flanc droit, vu des portes arrière. */
export type ArchSide = "left" | "right";

/** Ce que la rangée retient d'une pile : de quoi rendre ses coordonnées. */
export interface PrintedStack {
  readonly stackIndex: number;
  readonly outerLengthMm: number;
  readonly outerWidthMm: number;
}

/** Une empreinte de pile dans un sens, jeu compris. */
export interface Print {
  readonly orientation: RowOrientation;
  readonly depthMm: number;
  readonly widthMm: number;
  readonly stack: PrintedStack;
}

/**
 * Une pile posée AU-DESSUS d'un passage de roue (G5b, 2026-10-08) : contre
 * la paroi de ce flanc, à partir de l'étage `fromLevel` (`k₀`, la règle de
 * l'assistant d'achat), et `levels` bacs au plus. Le livreur la monte sur le
 * passage, pas au sol.
 */
export interface OverArchPlacement {
  readonly side: ArchSide;
  /** 0 = le sol ; la pile commence à cet étage. */
  readonly fromLevel: number;
  readonly levels: number;
}

/** La pile est posée au sol : sa rangée, son coin côté fond-gauche, son empreinte. */
export interface FloorPlacement {
  readonly kind: "floor";
  /** 1..n, depuis le fond. */
  readonly row: number;
  /** Distance depuis le fond (la cloison). */
  readonly xMm: number;
  /** Distance depuis le flanc gauche, vu depuis les portes arrière. */
  readonly yMm: number;
  /** Empreinte EXTÉRIEURE le long du véhicule, sans le jeu. */
  readonly depthMm: number;
  /** Empreinte EXTÉRIEURE en travers, sans le jeu. */
  readonly widthMm: number;
  readonly orientation: RowOrientation;
  /** `null` : posée au sol ; sinon, au-dessus de quel passage et à partir de quel étage. */
  readonly overArch: OverArchPlacement | null;
}

/**
 * Où va une pile : au sol, dans la caisse réfrigérée (le froid reste en
 * litres, G-Q3), ou hors plancher — l'alerte `floor_over`.
 */
export type StackPlacement =
  FloorPlacement | { readonly kind: "refrigerated" } | { readonly kind: "off_floor" };

/** Une pile posée au-dessus d'un passage : son empreinte, son flanc, ses étages. */
export interface OverPrint {
  readonly print: Print;
  readonly side: ArchSide;
  readonly levels: OverArchLevels;
}

/**
 * **Les rangées de la stratégie B** (G-D4), sorties de `place-stacks.ts` le
 * 2026-10-08 quand les piles au-dessus d'un passage (G5b) les ont fait
 * grandir : poser au sol, ouvrir une rangée, rendre les coordonnées.
 *
 * Une rangée transversale en cours de remplissage. Les piles AU SOL tiennent
 * dans la largeur libre ; celles AU-DESSUS d'un passage occupent la bande
 * d'un flanc, à côté d'elles : les deux ne se recouvrent jamais vues de
 * dessus.
 */
export interface OpenRow {
  readonly row: number;
  readonly fromMm: number;
  depthMm: number;
  readonly prints: Print[];
  readonly over: OverPrint[];
}

/** Les largeurs d'une rangée : au sol, puis au-dessus de chaque passage. */
interface Widths {
  readonly floorMm: number;
  readonly leftMm: number;
  readonly rightMm: number;
}

/** Une rangée neuve, à `fromMm` depuis le fond, ouverte par une pile au sol. */
export function openRow(row: number, fromMm: number, print: Print): OpenRow {
  return { row, fromMm, depthMm: print.depthMm, prints: [print], over: [] };
}

export function widthsOf(row: OpenRow): Widths {
  const sum = (side: ArchSide) =>
    row.over.filter((over) => over.side === side).reduce((total, o) => total + o.print.widthMm, 0);
  return {
    floorMm: row.prints.reduce((total, print) => total + print.widthMm, 0),
    leftMm: sum("left"),
    rightMm: sum("right"),
  };
}

/**
 * **Où commencent les piles au sol** sur la largeur, ou `null` : la rangée ne
 * tient pas. Au sol, elles restent entre les passages (`freeWidthMm`) ; les
 * piles au-dessus d'un passage prennent chacune la bande de leur flanc, contre
 * la paroi. Parmi les positions possibles, la plus à gauche : sans pile
 * au-dessus, c'est le bord du passage gauche, comme avant G5b.
 */
export function floorOffsetMm(
  floor: FloorMm,
  fromMm: number,
  depthMm: number,
  widths: Widths,
): number | null {
  if (fromMm + depthMm > floor.lengthMm) {
    return null;
  }
  const free = freeWidthMm(floor, fromMm, depthMm);
  const margin = (floor.widthMm - free) / 2;
  const low = Math.max(margin, widths.leftMm);
  const high = Math.min(floor.widthMm - margin, floor.widthMm - widths.rightMm) - widths.floorMm;
  return low <= high ? low : null;
}

/** La rangée touche-t-elle les passages sur cette profondeur ? */
export function touchesArches(floor: FloorMm, fromMm: number, depthMm: number): boolean {
  return freeWidthMm(floor, fromMm, depthMm) < floor.widthMm;
}

/** Le sens qui laisse le plus de largeur d'abord ; à égalité, dans la longueur. */
export function printsOf(stack: PrintedStack, gapMm: number): readonly Print[] {
  const long = stack.outerLengthMm + gapMm;
  const wide = stack.outerWidthMm + gapMm;
  const length: Print = { orientation: "length", depthMm: long, widthMm: wide, stack };
  const turned: Print = { orientation: "turned", depthMm: wide, widthMm: long, stack };
  return turned.widthMm < length.widthMm ? [turned, length] : [length, turned];
}

/** Au sol de la rangée ouverte, à droite des piles déjà posées. */
export function putOnFloor(
  floor: FloorMm,
  open: OpenRow | undefined,
  prints: readonly Print[],
): boolean {
  if (open === undefined) {
    return false;
  }
  const widths = widthsOf(open);
  for (const print of prints) {
    const depthMm = Math.max(open.depthMm, print.depthMm);
    const grown = { ...widths, floorMm: widths.floorMm + print.widthMm };
    if (floorOffsetMm(floor, open.fromMm, depthMm, grown) !== null) {
      open.depthMm = depthMm;
      open.prints.push(print);
      return true;
    }
  }
  return false;
}

/** Une rangée neuve, plus près des portes que la rangée ouverte. */
export function putInNewRow(floor: FloorMm, rows: OpenRow[], prints: readonly Print[]): boolean {
  const open = rows.at(-1);
  const fromMm = open === undefined ? 0 : open.fromMm + open.depthMm;
  for (const print of prints) {
    const widths = { floorMm: print.widthMm, leftMm: 0, rightMm: 0 };
    if (floorOffsetMm(floor, fromMm, print.depthMm, widths) !== null) {
      rows.push(openRow(rows.length + 1, fromMm, print));
      return true;
    }
  }
  return false;
}

/** Les coordonnées, une fois la profondeur de la rangée connue : elle décide du passage. */
export function finalize(floor: FloorMm, row: OpenRow): ReadonlyMap<number, FloorPlacement> {
  const placements = new Map<number, FloorPlacement>();
  const place = (print: Print, yMm: number, overArch: OverArchPlacement | null) => {
    const { stack } = print;
    const turned = print.orientation === "turned";
    placements.set(stack.stackIndex, {
      kind: "floor",
      row: row.row,
      xMm: row.fromMm,
      yMm,
      depthMm: turned ? stack.outerWidthMm : stack.outerLengthMm,
      widthMm: turned ? stack.outerLengthMm : stack.outerWidthMm,
      orientation: print.orientation,
      overArch,
    });
  };
  let yMm = floorOffsetMm(floor, row.fromMm, row.depthMm, widthsOf(row)) ?? 0;
  for (const print of row.prints) {
    place(print, yMm, null);
    yMm += print.widthMm;
  }
  let leftMm = 0;
  let rightMm = floor.widthMm;
  for (const over of row.over) {
    const overArch = { side: over.side, ...over.levels };
    if (over.side === "left") {
      place(over.print, leftMm, overArch);
      leftMm += over.print.widthMm;
    } else {
      rightMm -= over.print.widthMm;
      place(over.print, rightMm, overArch);
    }
  }
  return placements;
}
