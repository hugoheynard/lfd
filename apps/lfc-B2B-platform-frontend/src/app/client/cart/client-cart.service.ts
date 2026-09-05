import { computed, inject, Injectable } from '@angular/core';

import { type CartLine, type CartTotals, priceCart } from './cart-total';
import { CartStore } from './cart.store';
import { ClientOrder } from '../client-order.service';
import { productById, SHOP_PRODUCTS } from '../shop/mock-shop';

/**
 * **Le panier en cours** — un seul, partagé par le rayon, la fiche et le panier.
 *
 * Ce service porte les RÈGLES ; l'état est dans {@link CartStore}, qu'il est
 * seul à faire bouger. Le partage a une raison précise : une règle de panier se
 * relit et se discute (« retirer la dernière pièce retire la ligne »), alors
 * qu'une persistance se remplace (le jour où le panier devient un agrégat
 * serveur, c'est le dépôt qui change, et rien ici). Mélangées, la première
 * disparaissait dans les plis de la seconde.
 *
 * Trois règles vivent ici, et nulle part ailleurs :
 *
 * 1. **on n'ajoute que ce qui est au catalogue** — une référence inconnue est
 *    ignorée en silence plutôt que de rentrer dans un état qu'aucun écran ne
 *    saurait afficher ;
 * 2. **une ligne à zéro n'existe pas** — retirer la dernière pièce retire la
 *    ligne, ce qui n'est pas la même chose que la garder à zéro ;
 * 3. **les lignes sortent dans l'ordre du RAYON**, pas dans celui des ajouts :
 *    le panier doit se relire comme la boutique se parcourt.
 */
@Injectable({ providedIn: 'root' })
export class ClientCart {
  private readonly store = inject(CartStore);
  private readonly order = inject(ClientOrder);

  /** Les lignes, dans l'ordre du rayon — pas dans l'ordre des ajouts. */
  readonly lines = computed<readonly CartLine[]>(() => {
    const quantities = this.store.quantities();
    return SHOP_PRODUCTS.filter((p) => (quantities[p.id] ?? 0) > 0).map((product) => ({
      product,
      quantity: quantities[product.id] ?? 0,
    }));
  });

  /** Le nombre de PIÈCES, pas de références : c'est ce que le comptoir prépare. */
  readonly count = computed(() => this.lines().reduce((sum, l) => sum + l.quantity, 0));

  readonly isEmpty = computed(() => this.count() === 0);

  readonly totals = computed<CartTotals>(() => {
    const choice = this.order.choice();
    return priceCart(this.lines(), choice?.discount ?? 0, choice?.fee ?? 0);
  });

  quantityOf(productId: string): number {
    return this.store.quantityOf(productId);
  }

  add(productId: string): void {
    if (!productById(productId)) {
      return;
    }
    this.store.setQuantity(productId, this.store.quantityOf(productId) + 1);
  }

  /** Retirer la dernière pièce retire la ligne : une ligne à zéro n'existe pas. */
  remove(productId: string): void {
    this.store.setQuantity(productId, this.store.quantityOf(productId) - 1);
  }

  clear(): void {
    this.store.clear();
  }
}
