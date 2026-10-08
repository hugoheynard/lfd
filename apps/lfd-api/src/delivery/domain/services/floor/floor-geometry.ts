import type { CargoFloor } from "../../value-objects/cargo-floor.js";
import { MM_PER_CM } from "../../value-objects/bin-type-dimensions.js";

/**
 * **Le plancher en millimètres** (2026-10-06, `0bcb955a6`). Un véhicule se mesure au
 * centimètre, un type de bac au millimètre : les calculs de plancher se font
 * dans la plus fine des deux, et c'est le PLANCHER qu'on convertit — ×10 est
 * exact, ÷10 ne l'est pas (66,5 cm).
 */
export interface FloorMm {
  readonly lengthMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  /** La paire symétrique de passages, ou `null` : un rectangle. */
  readonly wheelArches: {
    readonly fromBackMm: number;
    /** Premier millimètre APRÈS le passage, depuis le fond. */
    readonly endMm: number;
    readonly protrusionMm: number;
    /** `null` : hauteur non mesurée. */
    readonly heightMm: number | null;
  } | null;
}

/** Le plancher d'un véhicule, converti sans perte. */
export function floorInMm(floor: CargoFloor): FloorMm {
  const arches = floor.wheelArches;
  return {
    lengthMm: floor.lengthCm * MM_PER_CM,
    widthMm: floor.widthCm * MM_PER_CM,
    heightMm: floor.heightCm * MM_PER_CM,
    wheelArches:
      arches === null
        ? null
        : {
            fromBackMm: arches.fromBackCm * MM_PER_CM,
            endMm: arches.endCm * MM_PER_CM,
            protrusionMm: arches.protrusionCm * MM_PER_CM,
            heightMm: arches.heightCm === null ? null : arches.heightCm * MM_PER_CM,
          },
  };
}

/**
 * **La largeur posable** sur la tranche `[fromMm, fromMm + depthMm)` du
 * plancher, mesurée depuis le fond (G-D2) : toute la largeur, ou la largeur
 * moins deux saillies si la tranche touche un passage de roue.
 *
 * Bornes semi-ouvertes : une tranche qui s'arrête pile où le passage commence
 * ne le touche pas. **Aucun bac n'est posé sur un passage de roue** : plus
 * haut la largeur redevient pleine, mais un bac ne vole pas.
 */
export function freeWidthMm(floor: FloorMm, fromMm: number, depthMm: number): number {
  const arches = floor.wheelArches;
  if (arches === null || !(fromMm < arches.endMm && arches.fromBackMm < fromMm + depthMm)) {
    return floor.widthMm;
  }
  return floor.widthMm - 2 * arches.protrusionMm;
}

/**
 * **Les étages d'une pile** : `min(maxStack, ⌊hauteur ÷ hauteur extérieure⌋)`.
 * Zéro quand le bac est plus haut que le plafond — il ne tient pas debout.
 */
export function stackLevels(floor: FloorMm, binOuterHeightMm: number, maxStack: number): number {
  return Math.min(maxStack, Math.floor(floor.heightMm / binOuterHeightMm));
}

/** Ce qu'une pile posée au-dessus d'un passage de roue peut monter (G-D2 bis). */
export interface OverArchLevels {
  /** `k₀ = ⌈hauteur du passage ÷ hauteur extérieure du bac⌉` : l'étage où elle commence, 0 = le sol. */
  readonly fromLevel: number;
  /** `étages − k₀` : ses bacs, au plus. */
  readonly levels: number;
}

/**
 * **La règle du dessus d'un passage**, UNE pour l'assistant d'achat
 * (`maximizeFormat`) et le plan de chargement (`FloorPlacer`, G5b) : un bac
 * qui monte au-dessus d'un passage commence à l'étage `k₀`, et sa pile en
 * compte au plus `étages − k₀`. `null` quand rien n'y monte : pas de passage,
 * hauteur non mesurée — on ne devine pas une hauteur —, ou aucun étage libre
 * au-dessus.
 *
 * @param levels les étages d'une pile de ce bac (`stackLevels`).
 */
export function overArchLevels(
  floor: FloorMm,
  binOuterHeightMm: number,
  levels: number,
): OverArchLevels | null {
  const archHeightMm = floor.wheelArches?.heightMm ?? null;
  if (archHeightMm === null) {
    return null;
  }
  const fromLevel = Math.ceil(archHeightMm / binOuterHeightMm);
  return levels - fromLevel > 0 ? { fromLevel, levels: levels - fromLevel } : null;
}
