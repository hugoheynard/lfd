import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import {
  FoldButtonComponent,
  FoldMultiselectComponent,
  FoldSearchComponent,
  type FoldSelectOption,
} from 'fold-ng';

/**
 * Barre de filtres du catalogue — présentation isolée : multiselect catégories,
 * recherche, bouton favoris et « Effacer ». L'état est en **two-way** (`model`)
 * pour que l'orchestrateur ({@link ProductCatalogue}) le lise et filtre ; le
 * composant ne connaît ni le panier ni les produits.
 */
@Component({
  selector: 'app-catalogue-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldMultiselectComponent, FoldSearchComponent, FoldButtonComponent],
  templateUrl: './catalogue-filters.html',
  styleUrl: './catalogue-filters.scss',
})
export class CatalogueFilters {
  /** Options de catégories (déjà mappées en `{ value, label }`). */
  readonly categories = input.required<readonly FoldSelectOption<string>[]>();
  /** Nombre de favoris — affiché sur le bouton. */
  readonly favoritesCount = input(0);

  readonly selectedCategories = model<string[]>([]);
  readonly query = model('');
  readonly favoritesOnly = model(false);

  protected readonly hasFilters = computed(
    () => this.selectedCategories().length > 0 || this.query().length > 0 || this.favoritesOnly(),
  );

  /** Aucune catégorie sélectionnée = « Toutes » (chip actif sur mobile). */
  protected readonly allSelected = computed(() => this.selectedCategories().length === 0);

  /** Cette catégorie est-elle active dans la bande mobile ? */
  protected isCatOn(id: string): boolean {
    return this.selectedCategories().includes(id);
  }

  /** Chip « Toutes » : vide la sélection de catégories. */
  protected selectAllCats(): void {
    this.selectedCategories.set([]);
  }

  /** Bascule une catégorie (bande mobile) — même modèle multi que le multiselect. */
  protected toggleCat(id: string): void {
    this.selectedCategories.update((cats) =>
      cats.includes(id) ? cats.filter((c) => c !== id) : [...cats, id],
    );
  }

  protected clear(): void {
    this.selectedCategories.set([]);
    this.query.set('');
    this.favoritesOnly.set(false);
  }
}
