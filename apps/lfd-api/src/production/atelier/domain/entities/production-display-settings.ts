/** L'état tel qu'il se pose, se lit et se journalise. */
export interface ProductionDisplaySettingsState {
  /** « Afficher les sous-catégories » : un intertitre par sous-catégorie dans le groupe racine. */
  readonly showSubcategories: boolean;
}

/**
 * **Le rangement du fournil** — Réglages › Production (Hugo, 2026-10-30).
 *
 * Prévisionnel, fiche d'atelier et dossier du jour rangent par catégorie
 * RACINE ; ce réglage dit s'ils posent, dans chaque groupe racine, un
 * intertitre par sous-catégorie. Aucune règle ne refuse cette écriture : un
 * réglage, sans transition — la classe ne porte que son défaut et son égalité.
 */
export class ProductionDisplaySettings implements ProductionDisplaySettingsState {
  private constructor(readonly showSubcategories: boolean) {}

  /** Personne n'a rien réglé : les sous-catégories ne s'affichent pas. */
  static defaults(): ProductionDisplaySettings {
    return new ProductionDisplaySettings(false);
  }

  static of(values: ProductionDisplaySettingsState): ProductionDisplaySettings {
    return new ProductionDisplaySettings(values.showSubcategories);
  }

  equals(other: ProductionDisplaySettingsState): boolean {
    return this.showSubcategories === other.showSubcategories;
  }
}
