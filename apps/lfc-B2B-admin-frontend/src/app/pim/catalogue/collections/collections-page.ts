import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FoldPageLayoutComponent } from 'fold-ng';

import { CollectionsTree } from '../collections-tree/collections-tree';
import { buildCollections } from '../../data/collections';
import { EmplacementStore } from '../../emplacements/emplacement-store';
import { CategoryStore } from '../category-store';
import { ProductStore } from '../product-store';
import { TvaStore } from '../tva-rates/tva-store';

/**
 * Arbre des collections que le paramétrage génère — trois lectures des tags,
 * jusqu'aux produits. **Live** : produits, familles et taux viennent des
 * stores backend ; se recompose à chaque réglage fait ailleurs.
 */
@Component({
  selector: 'app-collections-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, CollectionsTree],
  templateUrl: './collections-page.html',
})
export class CollectionsPage {
  private readonly products = inject(ProductStore);
  private readonly categories = inject(CategoryStore);
  private readonly rates = inject(TvaStore);
  private readonly emplacements = inject(EmplacementStore);

  protected readonly families = computed(() =>
    buildCollections(
      this.products.items(),
      this.categories.items(),
      this.rates.items(),
      this.emplacements.items(),
    ),
  );
}
