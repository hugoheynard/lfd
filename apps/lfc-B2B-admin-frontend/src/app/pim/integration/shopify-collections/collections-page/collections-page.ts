import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FoldPageLayoutComponent } from 'fold-ng';

import { CollectionsTree } from '../collections-tree/collections-tree';
import { buildCollections } from '../collections';
import { PointOfSaleStore } from '../../../points-of-sale/point-of-sale-store';
import { CategoryStore } from '../../../catalogue/category-store';
import { ProductStore } from '../../../catalogue/product-store';
import { VatRateStore } from '../../../catalogue/vat-rates/vat-store';

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
  private readonly rates = inject(VatRateStore);
  private readonly pointsOfSale = inject(PointOfSaleStore);

  protected readonly families = computed(() =>
    buildCollections(
      this.products.items(),
      this.categories.items(),
      this.rates.items(),
      this.pointsOfSale.items(),
    ),
  );
}
