import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import { FoldPageLayoutComponent } from 'fold-ng';

import { CollectionsTree } from '../collections-tree/collections-tree';
import { buildCollections } from '../../data/collections';
import { LocalDb } from '../../data/local-db';
import { CategoryStore } from '../category-store';
import { TvaStore } from '../tva-regimes/tva-store';

/**
 * Arbre des collections que le paramétrage génère — trois lectures des tags,
 * jusqu'aux produits. **Live** : familles et régimes viennent des stores backend,
 * les produits du store local ; se recompose à chaque réglage fait ailleurs.
 */
@Component({
  selector: 'app-collections-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, CollectionsTree],
  templateUrl: './collections-page.html',
})
export class CollectionsPage {
  private readonly db = inject(LocalDb);
  private readonly categories = inject(CategoryStore);
  private readonly regimes = inject(TvaStore);

  protected readonly families = computed(() =>
    buildCollections(
      this.db.snapshot().products,
      this.categories.items(),
      this.regimes.items(),
    ),
  );
}
