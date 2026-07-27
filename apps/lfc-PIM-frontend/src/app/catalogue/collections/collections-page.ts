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

/**
 * Arbre des collections que le paramétrage génère — trois lectures des tags,
 * jusqu'aux produits. **Live** : lit le store directement, donc se recompose à
 * chaque réglage fait sur n'importe quelle page.
 */
@Component({
  selector: 'app-collections-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, CollectionsTree],
  templateUrl: './collections-page.html',
})
export class CollectionsPage {
  private readonly db = inject(LocalDb);

  protected readonly families = computed(() =>
    buildCollections(
      this.db.snapshot().products,
      this.db.snapshot().categories,
      this.db.snapshot().tvaRegimes,
    ),
  );
}
