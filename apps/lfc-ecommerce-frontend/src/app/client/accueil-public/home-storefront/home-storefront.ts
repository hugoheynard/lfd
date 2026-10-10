import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import type { PublicStorefrontPageView } from '@lfd/contracts';

import { ShelfGrid } from '../../shop/shop-page/shelf-grid/shelf-grid';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { SHELF_PARAM } from '../../shop/shelves';
import { composedCells } from '../../shop/storefront/composed-cells';

const SHOP = '/boutique';

/** L'Accueil n'est pas un rayon : aucun article ne s'écoule dans ses cases libres. */
const NO_PRODUCTS: readonly never[] = [];

/**
 * **La vitrine de l'Accueil** — la page `home` composée dans l'éditeur du
 * back-office (L6 du plan de la médiathèque), rendue par la MÊME grille que
 * les rayons, avec le même registre de rendus.
 *
 * 🔴 **Un accueil vide n'affiche rien** : ni grille, ni « aucun article ».
 * Posée sans objet affichable, la grille du rayon dirait que le rayon est
 * vide — l'Accueil n'est pas un rayon, il n'a rien à excuser. Les cases
 * libres restent vides pour la même raison : aucun « reste du rayon » ne s'y
 * range.
 *
 * Ses gestes mènent à la boutique : une annonce ouvre son rayon
 * (`/boutique?rayon=…`), une pièce ouvre la boutique — la fiche est un état
 * de l'écran du rayon, pas de l'Accueil.
 */
@Component({
  selector: 'app-home-storefront',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ShelfGrid],
  templateUrl: './home-storefront.html',
})
export class HomeStorefront {
  /** La page `home`, ou `null` tant qu'elle n'est pas lue — ou si elle ne l'a pas été. */
  readonly page = input.required<PublicStorefrontPageView | null>();

  private readonly router = inject(Router);
  private readonly catalogue = inject(ShopCatalogue);

  protected readonly products = NO_PRODUCTS;

  /** La page, si elle pose au moins un objet affichable ; sinon rien ne paraît. */
  protected readonly shown = computed(() => {
    const page = this.page();
    if (page === null) {
      return null;
    }
    const served = new Set(this.catalogue.items().map((item) => item.sku));
    return composedCells(page, [], served, (key) => this.catalogue.operationOf(key) !== null) ===
      null
      ? null
      : page;
  });

  protected openShelf(shelf: string): void {
    void this.router.navigate([SHOP], { queryParams: { [SHELF_PARAM]: shelf } });
  }

  protected openShop(): void {
    void this.router.navigate([SHOP]);
  }
}
