import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { ProductCardComponent, type FoldProduct, type FoldProductOrder } from '../../../../shared';
import { type CatalogueCategory, formatEurValue } from '../../data/catalogue-seed';
import { CartService } from '../../data/cart.service';
import { FavoritesService } from '../../data/favorites.service';

/** Un rayon : une catégorie, son libellé, son compte, ses produits. */
interface Shelf {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly products: readonly FoldProduct[];
}

/** Clé du groupe « sans catégorie » (produits dont la `category` est absente/inconnue). */
const OTHER_ID = '__other__';

/**
 * Vue **rayons** du catalogue — un **rayon par catégorie** repliable (`Nom (N)`),
 * puis un **scroller horizontal** (une rangée, cartes larges, la suivante ne
 * dépasse que d'~1/8). Orientée **découverte**. Réutilise `app-product-card`.
 *
 * Vue « bête » pilotée par {@link ProductCatalogue} : reçoit les produits **déjà
 * filtrés** (pas de pagination), remonte `add`/`notify` ; favoris + panier via les
 * services.
 */
@Component({
  selector: 'app-category-shelves',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductCardComponent],
  templateUrl: './category-shelves.html',
  styleUrl: './category-shelves.scss',
})
export class CategoryShelves {
  readonly products = input.required<readonly FoldProduct[]>();
  readonly categories = input.required<readonly CatalogueCategory[]>();

  readonly add = output<FoldProductOrder>();
  readonly notify = output<FoldProduct>();

  protected readonly favorites = inject(FavoritesService);
  protected readonly cart = inject(CartService);
  protected readonly formatEur = formatEurValue;

  /** Ids des rayons **repliés** (par défaut tous dépliés). */
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());

  /** Rayons non vides, dans l'ordre des catégories ; « Autres » en fin si besoin. */
  protected readonly shelves = computed<readonly Shelf[]>(() => {
    const products = this.products();
    const out: Shelf[] = [];
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
