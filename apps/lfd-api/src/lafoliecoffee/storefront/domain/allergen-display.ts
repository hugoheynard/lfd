import { storefrontAllergenDisplays, type StorefrontAllergenDisplay } from "@lfd/contracts";

import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * **Où la boutique montre les allergènes** — réglage global de la vitrine
 * (Hugo, 2026-10-27, `documentation/pim/plan-allergenes-en-boutique.md`).
 *
 * `sheet` par défaut : la fiche ouverte seulement, la forme validée sur
 * maquette. `gallery` ajoute une mention compacte sur les cartes du rayon.
 */
export type AllergenDisplay = StorefrontAllergenDisplay;

/** Jamais réglé : la fiche ouverte seulement. */
export const DEFAULT_ALLERGEN_DISPLAY: AllergenDisplay = "sheet";

/** @throws {InvalidAllergenDisplayError} une valeur que la vitrine ne connaît pas. */
export function allergenDisplayOf(raw: string): AllergenDisplay {
  const known = storefrontAllergenDisplays.find((value) => value === raw);
  if (known === undefined) {
    throw new InvalidAllergenDisplayError(raw);
  }
  return known;
}

/** **400** — une place d'allergènes inconnue. */
export class InvalidAllergenDisplayError extends DomainError {
  constructor(raw: string) {
    super(
      "storefront.allergen_display_invalid",
      `« ${raw} » n'est pas une place d'allergènes connue : choisissez « sur la fiche ouverte seulement » ou « aussi dans la galerie ».`,
    );
  }
}

/** Le réglage, et quand il a été posé (`null` : jamais). */
export interface AllergenDisplaySetting {
  readonly allergenDisplay: AllergenDisplay;
  readonly updatedAt: Date | null;
}
