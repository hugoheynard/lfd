import type { AllergenDisplay } from "../domain/allergen-display.js";

/**
 * Règle où la boutique montre les allergènes (Hugo, 2026-10-27).
 * `staffUserId` : la fiche INTERNE de qui règle — jamais un `sub` Auth0.
 */
export class SetStorefrontAllergenDisplayCommand {
  constructor(
    readonly allergenDisplay: AllergenDisplay,
    readonly staffUserId: string,
  ) {}
}
