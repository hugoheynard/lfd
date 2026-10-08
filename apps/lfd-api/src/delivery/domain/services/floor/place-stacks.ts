import { MM_PER_CM } from "../../value-objects/bin-type-dimensions.js";
import type { CargoFloor } from "../../value-objects/cargo-floor.js";
import { type FloorMm, floorInMm, overArchLevels, stackLevels } from "./floor-geometry.js";
import {
  type ArchSide,
  finalize,
  floorOffsetMm,
  type OpenRow,
  type Print,
  printsOf,
  putInNewRow,
  putOnFloor,
  type StackPlacement,
  touchesArches,
  widthsOf,
} from "./open-row.js";

export type { FloorPlacement, OverArchPlacement, StackPlacement } from "./open-row.js";

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
  /** La hauteur et la pile du bac : elles disent si la pile monte au-dessus d'un passage (G5b). */
  readonly outerHeightMm: number;
  readonly maxStack: number;
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
 *   qui touche les passages commence au bord du passage gauche.
 * - Une pile qui ne tient plus au sol de la rangée ouverte peut monter
 *   AU-DESSUS d'un passage, si la rangée le touche, que sa hauteur est
 *   mesurée et qu'une pile au sol y est déjà (G5b, 2026-10-08, Hugo :
 *   « pourtant le simulateur arrive à les placer ») : à partir de l'étage
 *   `k₀`, `étages − k₀` bacs au plus — la règle de l'assistant d'achat,
 *   `overArchLevels`. Sans hauteur mesurée, rien n'y monte.
 * - Une pile qui ne tient pas sort SEULE (G5c, 2026-10-08, Hugo : « livrer
 *   emporte sur léger désordre ») : les suivantes essaient encore la rangée
 *   ouverte, puis une rangée neuve. Jusque-là, elles sortaient toutes avec
 *   elle (décision par défaut du 2026-10-02).
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
  private readonly overLevels = new Map<number, number>();
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
    const prints = printsOf(stack, this.gapMm);
    const placed =
      putOnFloor(this.floor, this.rows.at(-1), prints) ||
      this.putOverArch(stack, prints) ||
      putInNewRow(this.floor, this.rows, prints);
    if (!placed) {
      this.elsewhere.set(stack.stackIndex, { kind: "off_floor" });
      return;
    }
    this.rowOf.set(stack.stackIndex, this.rows.length);
  }

  /** Au-dessus d'un passage de la rangée ouverte, le flanc le moins chargé d'abord. */
  private putOverArch(stack: StackToPlace, prints: readonly Print[]): boolean {
    const open = this.rows.at(-1);
    const levels = overArchLevels(
      this.floor,
      stack.outerHeightMm,
      stackLevels(this.floor, stack.outerHeightMm, stack.maxStack),
    );
    if (open === undefined || levels === null) {
      return false;
    }
    const widths = widthsOf(open);
    const sides: readonly ArchSide[] =
      widths.rightMm < widths.leftMm ? ["right", "left"] : ["left", "right"];
    for (const side of sides) {
      for (const print of prints) {
        const depthMm = Math.max(open.depthMm, print.depthMm);
        const grown = {
          ...widths,
          leftMm: widths.leftMm + (side === "left" ? print.widthMm : 0),
          rightMm: widths.rightMm + (side === "right" ? print.widthMm : 0),
        };
        if (
          touchesArches(this.floor, open.fromMm, depthMm) &&
          floorOffsetMm(this.floor, open.fromMm, depthMm, grown) !== null
        ) {
          open.depthMm = depthMm;
          open.over.push({ print, side, levels });
          this.overLevels.set(stack.stackIndex, levels.levels);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * **Combien d'étages une pile de ce type peut monter** : la règle de la
   * stratégie A (`stackLevels`), plafond de la caisse compris. Un isotherme
   * qui part en caisse réfrigérée n'est borné que par sa pile : la hauteur
   * de la caisse froide n'est pas mesurée (le froid reste en litres, G-Q3).
   * Zéro : le bac est plus haut que la caisse, il ne tient pas debout.
   *
   * Avec `stackIndex`, les étages de CETTE pile : posée au-dessus d'un
   * passage, elle n'en a que `étages − k₀` (G5b) — on n'y monte pas au-delà.
   */
  levelsOf(
    binType: {
      readonly isotherm: boolean;
      readonly outerHeightMm: number;
      readonly maxStack: number;
    },
    stackIndex?: number,
  ): number {
    const overArch = stackIndex === undefined ? undefined : this.overLevels.get(stackIndex);
    if (overArch !== undefined) {
      return overArch;
    }
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
   * Une pile peut-elle encore monter ? Au sol comme au-dessus d'un passage,
   * seulement tant que sa rangée est la rangée ouverte : une rangée fermée a
   * une pile chargée APRÈS elle devant elle, et un bac posé dessus serait
   * livré avant ce qui le cache. La caisse froide et le hors-plancher ne
   * ferment pas. Le plafond d'une pile au-dessus d'un passage, lui, est dans
   * `levelsOf(binType, stackIndex)`.
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
