import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

import { FoldProductCardComponent, type FoldProduct, type FoldProductOrder } from '../../../shared';
import { formatEurValue } from '../../data/catalogue-seed';
import { CartService } from '../../data/cart.service';
import { FavoritesService } from '../../data/favorites.service';

/** Un produit mis en avant, avec son tag optionnel et sa mise en relief. */
export interface FeaturedItem {
  readonly product: FoldProduct;
  /** Tag affiché au-dessus de la carte (`''` = aucun). */
  readonly flag: string;
  /** Contour épais (best-seller). */
  readonly highlight: boolean;
}

/**
 * **À la une** — rail des produits mis en avant. Sur desktop : 3 cartes en
 * grille, le best-seller au centre. Sur mobile : un carrousel scroll-snap avec
 * flèches gauche/droite (même méthode que le bandeau), le best-seller en
 * premier (via `order`). Le rail possède l'état favori (service injecté) et
 * remonte seulement `add`/`notify` au parent.
 */
@Component({
  selector: 'app-featured-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldProductCardComponent],
  templateUrl: './featured-rail.html',
  styleUrl: './featured-rail.scss',
})
export class FeaturedRail {
  protected readonly favorites = inject(FavoritesService);
  protected readonly cart = inject(CartService);

  /** Formateur de prix passé aux cartes pour le sous-total ligne. */
  protected readonly formatEur = formatEurValue;

  readonly items = input.required<readonly FeaturedItem[]>();

  readonly add = output<FoldProductOrder>();
  readonly notify = output<FoldProduct>();

  private readonly track = viewChild<ElementRef<HTMLElement>>('track');

  protected onFav(product: FoldProduct): void {
    this.favorites.toggle(product.id);
  }

  protected onAdd(order: FoldProductOrder): void {
    this.add.emit(order);
  }

  protected onNotify(product: FoldProduct): void {
    this.notify.emit(product);
  }

  /** Fait défiler le rail d'environ une carte (mobile). */
  protected scrollByCards(direction: -1 | 1): void {
    const el = this.track()?.nativeElement;
    if (el === undefined) {
      return;
    }
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' });
  }
}
