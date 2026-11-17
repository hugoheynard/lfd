import type { ProductionGrouping } from "@lfd/contracts";

/** L'état tel qu'il se pose, se lit et se journalise. */
export interface ProductionDisplaySettingsState {
  /** « Afficher les sous-catégories » : un intertitre par sous-catégorie dans le groupe. */
  readonly showSubcategories: boolean;
  /** Mode boutique (`shelf`, par rayon) ou mode prod (`workstation`, par poste). */
  readonly grouping: ProductionGrouping;
}

/**
 * **Le rangement du fournil** — Réglages › Production (Hugo, 2026-10-30).
 *
 * Prévisionnel, fiche d'atelier et dossier du jour rangent par catégorie
 * RACINE (mode boutique) ou par poste (mode prod, plan
 * `documentation/fournil/les-postes-du-fournil.md`) ; `showSubcategories` dit s'ils posent,
 * dans chaque groupe, un intertitre par sous-catégorie ou par rayon. Aucune
 * règle de cette classe ne refuse une écriture : la garde de bascule en mode
 * prod lit les postes, et vit dans le cas d'usage qui pose le réglage.
 */
export class ProductionDisplaySettings implements ProductionDisplaySettingsState {
  private constructor(
    readonly showSubcategories: boolean,
    readonly grouping: ProductionGrouping,
  ) {}

  /** Personne n'a rien réglé : mode boutique, sans sous-catégories. */
  static defaults(): ProductionDisplaySettings {
    return new ProductionDisplaySettings(false, "shelf");
  }

  static of(values: ProductionDisplaySettingsState): ProductionDisplaySettings {
    return new ProductionDisplaySettings(values.showSubcategories, values.grouping);
  }

  equals(other: ProductionDisplaySettingsState): boolean {
    return this.showSubcategories === other.showSubcategories && this.grouping === other.grouping;
  }
}
