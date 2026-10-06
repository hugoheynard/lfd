import { MM_PER_CM } from "../../value-objects/bin-type-dimensions.js";
import type { CargoFloor } from "../../value-objects/cargo-floor.js";
import { type FloorMm, floorInMm, freeWidthMm, stackLevels } from "./floor-geometry.js";
import type { RowOrientation } from "./maximize-format.js";

/**
 * Une pile telle que la stratégie B la lit : son empreinte extérieure, son
 * froid. **Tout est en millimètres** (2026-10-07) : un type de bac se mesure
 * au millimètre, et c'est le plancher du véhicule (en cm) qu'on convertit.
 */
export interface StackToPlace {
  readonly stackIndex: number;
  readonly isotherm: boolean;
  readonly outerLengthMm: number;
  readonly outerWidthMm: number;
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
  readonly depthMm: number;
  readonly widthMm: number;
  readonly stack: StackToPlace;
}

interface OpenRow {
  readonly row: number;
  readonly fromMm: number;
  depthMm: number;
  usedWidthMm: number;
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
 * - Au sol, aucune pile sur un passage de roue (`freeWidthMm`) ; une rangée
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
  const placer = new FloorPlacer(floor, gapCm, refrigerated);
  for (const stack of stacks) {
    placer.place(stack);
  }
  return placer.placements();
}

/**
 * **La même stratégie B, pile après pile**, pour qui empile en même temps
 * qu'il pose : le plan de chargement demande, avant de monter un bac sur une
 * pile déjà ouverte, si sa rangée est encore la rangée ouverte (G-D4 ter).
 */
export class FloorPlacer {
  private readonly rows: OpenRow[] = [];
  private readonly rowOf = new Map<number, number>();
  private readonly elsewhere = new Map<number, StackPlacement>();
  private blocked = false;
  private readonly tooTall = new Set<number>();
  private readonly floor: FloorMm;
  private readonly gapMm: number;

  /** Le plancher et le jeu arrivent en cm (le véhicule) ; convertis ×10, sans perte. */
  constructor(
    floor: CargoFloor,
    gapCm: number,
    private readonly refrigerated: boolean,
  ) {
    this.floor = floorInMm(floor);
    this.gapMm = gapCm * MM_PER_CM;
  }

  /** Pose une pile neuve : dans la caisse froide, au sol, ou hors plancher. */
  place(stack: StackToPlace): void {
    if (stack.isotherm && this.refrigerated) {
      this.elsewhere.set(stack.stackIndex, { kind: "refrigerated" });
      return;
    }
    this.blocked = this.blocked || !put(this.floor, this.rows, printsOf(stack, this.gapMm));
    if (this.blocked) {
      this.elsewhere.set(stack.stackIndex, { kind: "off_floor" });
      return;
    }
    this.rowOf.set(stack.stackIndex, this.rows.length);
  }

  /**
   * **Combien d'étages une pile de ce type peut monter** : la règle de la
   * stratégie A (`stackLevels`), plafond de la caisse compris. Un isotherme
   * qui part en caisse réfrigérée n'est borné que par sa pile : la hauteur
   * de la caisse froide n'est pas mesurée (le froid reste en litres, G-Q3).
   * Zéro : le bac est plus haut que la caisse, il ne tient pas debout.
   */
  levelsOf(binType: {
    readonly isotherm: boolean;
    readonly outerHeightMm: number;
    readonly maxStack: number;
  }): number {
    if (binType.isotherm && this.refrigerated) {
      return binType.maxStack;
    }
    return stackLevels(this.floor, binType.outerHeightMm, binType.maxStack);
  }

  /**
   * Une pile dont le bac est plus haut que la caisse : hors plancher, SANS
   * bloquer les suivantes — elle n'occupe aucune place au sol, elle n'y entre
   * pas du tout.
   */
  refuseTooTall(stackIndex: number): void {
    this.tooTall.add(stackIndex);
    this.elsewhere.set(stackIndex, { kind: "off_floor" });
  }

  /** Les piles refusées par `refuseTooTall`. */
  tooTallStacks(): ReadonlySet<number> {
    return this.tooTall;
  }

  /**
   * Une pile peut-elle encore monter ? Au sol, seulement tant que sa rangée
   * est la rangée ouverte : une rangée fermée a une pile chargée APRÈS elle
   * devant elle, et un bac posé dessus serait livré avant ce qui le cache.
   * La caisse froide et le hors-plancher ne ferment pas.
   */
  canGrow(stackIndex: number): boolean {
    const row = this.rowOf.get(stackIndex);
    return row === undefined || row === this.rows.length;
  }

  placements(): ReadonlyMap<number, StackPlacement> {
    const placements = new Map<number, StackPlacement>(this.elsewhere);
    for (const row of this.rows) {
      for (const [index, placement] of finalize(this.floor, row)) {
        placements.set(index, placement);
      }
    }
    return placements;
  }
}

/** Le sens qui laisse le plus de largeur d'abord ; à égalité, dans la longueur. */
function printsOf(stack: StackToPlace, gapMm: number): readonly Print[] {
  const long = stack.outerLengthMm + gapMm;
  const wide = stack.outerWidthMm + gapMm;
  const length: Print = { orientation: "length", depthMm: long, widthMm: wide, stack };
  const turned: Print = { orientation: "turned", depthMm: wide, widthMm: long, stack };
  return turned.widthMm < length.widthMm ? [turned, length] : [length, turned];
}

/** Dans la rangée ouverte, sinon dans une rangée neuve ; `false` = hors plancher. */
function put(floor: FloorMm, rows: OpenRow[], prints: readonly Print[]): boolean {
  const open = rows[rows.length - 1];
  if (open !== undefined) {
    for (const print of prints) {
      const depthMm = Math.max(open.depthMm, print.depthMm);
      if (fits(floor, open.fromMm, depthMm, open.usedWidthMm + print.widthMm)) {
        open.depthMm = depthMm;
        open.usedWidthMm += print.widthMm;
        open.prints.push(print);
        return true;
      }
    }
  }
  const fromMm = open === undefined ? 0 : open.fromMm + open.depthMm;
  for (const print of prints) {
    if (fits(floor, fromMm, print.depthMm, print.widthMm)) {
      rows.push({
        row: rows.length + 1,
        fromMm,
        depthMm: print.depthMm,
        usedWidthMm: print.widthMm,
        prints: [print],
      });
      return true;
    }
  }
  return false;
}

function fits(floor: FloorMm, fromMm: number, depthMm: number, widthMm: number): boolean {
  return fromMm + depthMm <= floor.lengthMm && widthMm <= freeWidthMm(floor, fromMm, depthMm);
}

/** Les coordonnées, une fois la profondeur de la rangée connue : elle décide du passage. */
function finalize(floor: FloorMm, row: OpenRow): ReadonlyMap<number, FloorPlacement> {
  const offsetMm = (floor.widthMm - freeWidthMm(floor, row.fromMm, row.depthMm)) / 2;
  const placements = new Map<number, FloorPlacement>();
  let yMm = offsetMm;
  for (const print of row.prints) {
    const turned = print.orientation === "turned";
    placements.set(print.stack.stackIndex, {
      kind: "floor",
      row: row.row,
      xMm: row.fromMm,
      yMm,
      depthMm: turned ? print.stack.outerWidthMm : print.stack.outerLengthMm,
      widthMm: turned ? print.stack.outerLengthMm : print.stack.outerWidthMm,
      orientation: print.orientation,
    });
    yMm += print.widthMm;
  }
  return placements;
}
