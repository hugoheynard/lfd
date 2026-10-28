import { Injectable, inject } from '@angular/core';

import { CartEntries } from '../cart/cart-entries';
import { ClientCart } from '../cart/client-cart.service';
import { ProductAudience } from '../audience/product-audience.service';
import { CartAnnouncer } from './cart-announcer.service';

/**
 * **La quantité posée depuis une fiche** — la boutique et l'accueil la posent
 * de la même façon (Hugo, 2026-10-28 : un incontournable de « Bienvenue »
 * ouvre sa fiche SUR PLACE, sans mener à la boutique).
 *
 * La quantité est POSÉE, pas ajoutée. Le panier compte l'entrée, la mesure
 * d'audience l'ajout, et l'annonce « Ajouté ! » part.
 */
@Injectable({ providedIn: 'root' })
export class PieceQuantity {
  private readonly cart = inject(ClientCart);
  private readonly audience = inject(ProductAudience);
  private readonly entries = inject(CartEntries);
  private readonly announcer = inject(CartAnnouncer);

  /**
   * Rend `false` quand la fiche doit rester ouverte : la visite pro détourne
   * le geste vers la connexion.
   */
  set(id: string, quantity: number): boolean {
    const entering = this.cart.quantityOf(id) === 0 && quantity > 0;
    if (this.cart.setQuantity(id, quantity) === 'signInRequired') {
      return false;
    }
    if (entering) {
      this.audience.record(id, 'added_to_cart');
    }
    if (entering && this.cart.quantityOf(id) > 0) {
      this.entries.entered(id);
    }
    this.announcer.announce(id);
    return true;
  }
}
