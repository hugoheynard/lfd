import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { FoldDisclosureComponent } from 'fold-ng';

import {
  CatalogueApi,
  type Category,
  type Product,
} from '../../catalogue/catalogue-api';

interface MenuGroup {
  readonly category: Category;
  readonly products: readonly Product[];
}

/**
 * Aperçu concret d'une **feuille** : la disponibilité « sur place » telle que la
 * verrait un client après scan du QR de sa table — les catégories en
 * `fold-disclosure`, les produits dedans. Données live (LocalDb).
 */
@Component({
  selector: 'app-leaf-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldDisclosureComponent],
  templateUrl: './leaf-preview.html',
  styleUrl: './leaf-preview.scss',
})
export class LeafPreview {
  private readonly api = inject(CatalogueApi);

  private readonly categories = signal<Category[]>([]);
  private readonly products = signal<Product[]>([]);

  /** Catégories actives portant au moins un produit non archivé. */
  protected readonly groups = computed<MenuGroup[]>(() => {
    const byCategory = new Map<string, Product[]>();
    for (const product of this.products()) {
      if (product.status === 'archived') {
        continue;
      }
      const bucket = byCategory.get(product.categoryId);
      if (bucket === undefined) {
        byCategory.set(product.categoryId, [product]);
      } else {
        bucket.push(product);
      }
    }
    return this.categories()
      .filter((category) => !category.isArchived)
      .map((category) => ({
        category,
        products: byCategory.get(category.id) ?? [],
      }))
      .filter((group) => group.products.length > 0);
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const [categories, products] = await Promise.all([
      this.api.listCategories(),
      this.api.listProducts(),
    ]);
    this.categories.set(categories);
    this.products.set(products);
  }
}
