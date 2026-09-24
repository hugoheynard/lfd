/**
 * Le ton d'un objet de vitrine — son allure de fond
 * (`plan-vitrine-enregistrement.md`, D3, Hugo 2026-09-24).
 *
 * - `light` : papier crème, cerne or — l'allure du best-seller ; le défaut ;
 * - `dark` : encre noire — la tuile Noël ;
 * - `accent` : encre bleue — la bande Pâques.
 */

import type { StorefrontShape } from "./grid.js";

export const STOREFRONT_TONES = ["light", "dark", "accent"] as const;
export type StorefrontTone = (typeof STOREFRONT_TONES)[number];

export const DEFAULT_TONE: StorefrontTone = "light";

/** Ce que `toneApplies` regarde d'un contenu : sa nature, rien d'autre. */
export interface ToneContent {
  readonly kind: "product" | "info";
}

/**
 * Le ton se voit-il ? Partout, SAUF sur un produit rendu en carte 1×1 : celle-ci
 * garde le rendu standard du rayon, pour que la grille reste homogène. Le ton
 * reste stocké sur l'objet — c'est le rendu qui l'ignore, et l'éditeur qui ne le
 * propose pas.
 *
 * ⚠️ Une carte SANS contenu garde son ton : elle n'est pas (encore) un produit,
 * et `every()` sur une liste vide dirait le contraire.
 */
export function toneApplies(shape: StorefrontShape, contents: readonly ToneContent[]): boolean {
  if (shape !== "card" || contents.length === 0) {
    return true;
  }
  return !contents.every((content) => content.kind === "product");
}
