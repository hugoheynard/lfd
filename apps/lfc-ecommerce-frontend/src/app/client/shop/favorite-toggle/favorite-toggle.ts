import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FoldToggleIconComponent } from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { ShopFavorites } from '../shop-favorites.store';

/**
 * **Le cœur d'un article** — pose ou retire le favori dans l'espace qui
 * s'affiche (`commandes/boutique/les-favoris.md`). Un interrupteur fold
 * (`aria-pressed`), dont le nom dit le geste à venir.
 */
@Component({
  selector: 'app-favorite-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldToggleIconComponent],
  templateUrl: './favorite-toggle.html',
})
export class FavoriteToggle {
  readonly sku = input.required<string>();

  private readonly favorites = inject(ShopFavorites);
  private readonly t = inject(ClientCopyService).t;

  protected readonly active = computed(() => this.favorites.skus().has(this.sku()));

  protected readonly label = computed(() => {
    const product = this.t().product;
    return this.active() ? product.favoriteRemove : product.favoriteAdd;
  });

  protected toggle(): void {
    void this.favorites.toggle(this.sku());
  }
}
