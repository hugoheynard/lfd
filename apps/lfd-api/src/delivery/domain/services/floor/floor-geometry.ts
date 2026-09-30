import type { CargoFloor } from "../../value-objects/cargo-floor.js";

/**
 * **La largeur posable** sur la tranche `[fromCm, fromCm + depthCm)` du
 * plancher, mesurée depuis le fond (G-D2) : toute la largeur, ou la largeur
 * moins deux saillies si la tranche touche un passage de roue.
 *
 * Bornes semi-ouvertes : une tranche qui s'arrête pile où le passage commence
 * ne le touche pas. **Aucun bac n'est posé sur un passage de roue** : plus
 * haut la largeur redevient pleine, mais un bac ne vole pas.
 */
export function freeWidthCm(floor: CargoFloor, fromCm: number, depthCm: number): number {
  const arches = floor.wheelArches;
  if (arches === null || !arches.touches(fromCm, depthCm)) {
    return floor.widthCm;
  }
  return floor.widthCm - 2 * arches.protrusionCm;
}

/**
 * **Les étages d'une pile** : `min(maxStack, ⌊hauteur ÷ hauteur extérieure⌋)`.
 * Zéro quand le bac est plus haut que le plafond — il ne tient pas debout.
 */
export function stackLevels(floor: CargoFloor, binOuterHeightCm: number, maxStack: number): number {
  return Math.min(maxStack, Math.floor(floor.heightCm / binOuterHeightCm));
}
