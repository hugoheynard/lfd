import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { FoldProductCardComponent, type FoldProduct, type FoldProductOrder } from '../../../shared';
import { formatEurValue } from '../../data/catalogue-seed';
import { CartService } from '../../data/cart.service';
import { FavoritesService } from '../../data/favorites.service';

/**
 * Vue **cartes** du catalogue — la grille fluide de `fold-product-card`. Vue
 * « bête » pilotée par {@link ProductCatalogue} : elle reçoit les produits à
 * afficher et remonte `add`/`notify` ; favoris + panier via les services.
 */
@Component({
  selector: 'app-card-catalog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldProductCardComponent],
  templateUrl: './card-catalog.html',
  styleUrl: './card-catalog.scss',
})
export class CardCatalog {
  readonly products = input.required<readonly FoldProduct[]>();

  readonly add = output<FoldProductOrder>();
  readonly notify = output<FoldProduct>();

  protected readonly favorites = inject(FavoritesService);
  protected readonly cart = inject(CartService);
  protected readonly formatEur = formatEurValue;

  protected onFav(product: FoldProduct): void {
    this.favorites.toggle(product.id);
  }
}
