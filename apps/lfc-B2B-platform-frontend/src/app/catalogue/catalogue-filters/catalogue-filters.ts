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

  protected clear(): void {
    this.selectedCategories.set([]);
    this.query.set('');
    this.favoritesOnly.set(false);
  }
}
