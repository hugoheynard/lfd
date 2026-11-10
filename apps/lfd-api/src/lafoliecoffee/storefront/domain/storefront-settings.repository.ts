import type { AllergenDisplay } from "./allergen-display.js";

/**
 * Port d'**écriture** des réglages globaux de la vitrine.
 *
 * Un CRUD honnête (CLAUDE.md §3.1, « config sans transition ni invariant ») :
 * aucune règle ne peut refuser de poser une valeur bien formée, et la forme
 * est tenue par le type et par la contrainte en base.
 */
export abstract class StorefrontSettingsRepository {
  /**
   * Pose la place des allergènes, dans la transaction ambiante, et rend celle
   * d'AVANT (le défaut si jamais réglé) — sous verrou de ligne, pour que la
   * trace dise vrai même si deux personnes règlent en même temps.
   */
  abstract setAllergenDisplay(
    value: AllergenDisplay,
    at: Date,
    staffId: string,
  ): Promise<AllergenDisplay>;
}
