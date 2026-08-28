import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { ProductRowComponent, type FoldProduct, type FoldProductOrder } from '../../../../shared';
import { type CatalogueCategory } from '../../data/catalogue-seed';
import { CartService } from '../../data/cart.service';
import { FavoritesService } from '../../data/favorites.service';

/** Un groupe : une catégorie, son libellé, son compte, ses produits. */
interface Group {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly products: readonly FoldProduct[];
}

/** Clé du groupe « sans catégorie » (produits dont la `category` est absente/inconnue). */
const OTHER_ID = '__other__';

/**
 * Vue **liste** du catalogue — une **liste order-pad compacte** groupée par
 * catégorie **repliable** (`Nom (N)`), pensée pour le **réappro** dense
 * (`app-product-row`). Vue « bête » pilotée par {@link ProductCatalogue} : reçoit
 * les produits **déjà filtrés** (pas de pagination), remonte `add`/`notify` ;
 * favoris + panier via les services.
 */
@Component({
  selector: 'app-category-catalog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductRowComponent],
  templateUrl: './category-catalog.html',
  styleUrl: './category-catalog.scss',
})
export class CategoryCatalog {
  readonly products = input.required<readonly FoldProduct[]>();
  readonly categories = input.required<readonly CatalogueCategory[]>();

  readonly add = output<FoldProductOrder>();
  readonly notify = output<FoldProduct>();

  protected readonly favorites = inject(FavoritesService);
  protected readonly cart = inject(CartService);

  /** Ids des groupes **repliés** (par défaut tous dépliés). */
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());

  /** Groupes non vides, dans l'ordre des catégories ; « Autres » en fin si besoin. */
  protected readonly groups = computed<readonly Group[]>(() => {
    const products = this.products();
    const out: Group[] = [];
    for (const category of this.categories()) {
      const items = products.filter((p) => p.category === category.id);
      if (items.length > 0) {
        out.push({ id: category.id, label: category.label, count: items.length, products: items });
      }
    }
    const known = new Set(this.categories().map((c) => c.id));
    const others = products.filter((p) => p.category === undefined || !known.has(p.category));
    if (others.length > 0) {
      out.push({ id: OTHER_ID, label: 'Autres', count: others.length, products: others });
    }
    return out;
  });

  protected isCollapsed(id: string): boolean {
    return this.collapsed().has(id);
  }

  protected toggle(id: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected onFav(product: FoldProduct): void {
    this.favorites.toggle(product.id);
  }
}
