import { inject, Injectable, signal } from '@angular/core';

import { ClientCart } from '../cart/client-cart.service';
import { ClientCopyService, fill } from '../copy/client-copy.service';
import { ShopCatalogue } from './shop-catalogue.store';

/**
 * **Ce que le panier vient de devenir, dit à voix haute** (RGAA 7.5, lot A2).
 *
 * Le « + » d'une tuile ne change rien à l'endroit où l'on regarde : la quantité
 * monte en pastille sur la photo, et cette pastille est muette. Un lecteur
 * d'écran n'apprenait donc jamais que l'article était au panier.
 *
 * Un service plutôt qu'un état de la grille : la région qui parle doit vivre
 * HORS de la liste des produits (une liste ne contient que des éléments de
 * liste), et la fiche, qui pose une quantité, dit la même chose.
 */
@Injectable({ providedIn: 'root' })
export class CartAnnouncer {
  private readonly cart = inject(ClientCart);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly t = inject(ClientCopyService).t;

  private readonly said = signal('');

  /** La dernière phrase, vide avant le premier geste. */
  readonly message = this.said.asReadonly();

  /** Dit la quantité de cet article au panier, telle qu'elle est maintenant. */
  announce(sku: string): void {
    const name = this.catalogue.itemOf(sku)?.name;
    if (name === undefined) {
      return;
    }
    const count = this.cart.quantityOf(sku);
    const shop = this.t().shop;
    this.said.set(
      count > 0
        ? fill(shop.cartStatusCount, { name, count: String(count) })
        : fill(shop.cartStatusRemoved, { name }),
    );
  }
}
