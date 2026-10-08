import type { FloorPlacer } from "./floor/place-stacks.js";
import type { LoadingStack, PlanBin, PlanBinType } from "./loading-plan.js";
import type { PlanUnit } from "./loading-volume.js";

/**
 * `coherent` : une pile ne monte plus quand sa rangée est fermée (G-D4 ter).
 * `compact` : elle monte aussi haut que la pile le permet — `maxStack`, borné
 * par le plafond depuis le 2026-10-06 —, quitte à poser des bacs derrière.
 */
export type StackingMode = "coherent" | "compact";

/** Le bac PHYSIQUE : celui d'une moitié, ou le bac entier lui-même. */
export function physicalKey(bin: PlanBin): string {
  return bin.physicalBinId ?? bin.id;
}

interface OpenStack {
  readonly stackIndex: number;
  readonly binType: PlanBinType;
  height: number;
  readonly stopPositions: number[];
}

/**
 * Pose les bacs physiques en piles, dans l'ordre où on les charge. Sorti de
 * `loading-plan.ts` : la règle des piles (étages, rangée fermée, moitiés
 * réunies) se lit seule, l'ordre des étapes reste au plan.
 */
export class Stacker {
  private readonly all: OpenStack[] = [];

  /** `null` : un véhicule sans cotes n'a pas de rangées, aucune pile ne ferme. */
  constructor(
    private readonly placer: FloorPlacer | null,
    private readonly mode: StackingMode,
  ) {}

  private readonly lastOfType = new Map<string, OpenStack>();
  private readonly placed = new Map<
    string,
    { stack: OpenStack; behind: boolean; unit: PlanUnit }
  >();

  /**
   * Rend la pile du bac, et s'il y est posé derrière ; une seconde moitié
   * rejoint celle de la première, au même titre.
   */
  put(
    bin: PlanBin,
    stopPosition: number,
  ): { readonly stackIndex: number; readonly behind: boolean } {
    const key = physicalKey(bin);
    const known = this.placed.get(key);
    if (known !== undefined) {
      known.unit.bins.push(bin);
      return { stackIndex: known.stack.stackIndex, behind: known.behind };
    }
    const stack = this.stackFor(bin.binType);
    const behind = stack.height > 0 && !(this.placer?.canGrow(stack.stackIndex) ?? true);
    stack.height += 1;
    if (!stack.stopPositions.includes(stopPosition)) {
      stack.stopPositions.push(stopPosition);
    }
    this.placed.set(key, { stack, behind, unit: { binType: bin.binType, bins: [bin] } });
    return { stackIndex: stack.stackIndex, behind };
  }

  private stackFor(binType: PlanBinType): OpenStack {
    const last = this.lastOfType.get(binType.id);
    // Les étages de CETTE pile : au-dessus d'un passage, `étages − k₀` (G5b).
    const lastLevels =
      last === undefined
        ? 0
        : (this.placer?.levelsOf(binType, last.stackIndex) ?? binType.maxStack);
    if (
      last !== undefined &&
      last.height < lastLevels &&
      (this.mode === "compact" || (this.placer?.canGrow(last.stackIndex) ?? true))
    ) {
      return last;
    }
    const stack: OpenStack = {
      stackIndex: this.all.length + 1,
      binType,
      height: 0,
      stopPositions: [],
    };
    this.all.push(stack);
    this.lastOfType.set(binType.id, stack);
    if ((this.placer?.levelsOf(binType) ?? binType.maxStack) === 0) {
      this.placer?.refuseTooTall(stack.stackIndex);
    } else {
      this.placer?.place({ stackIndex: stack.stackIndex, ...binType });
    }
    return stack;
  }

  stacks(): readonly Omit<LoadingStack, "placement">[] {
    return this.all.map((stack) => ({
      stackIndex: stack.stackIndex,
      binType: stack.binType,
      height: stack.height,
      stopPositions: [...stack.stopPositions],
    }));
  }

  units(): readonly PlanUnit[] {
    return [...this.placed.values()].map((entry) => entry.unit);
  }
}
