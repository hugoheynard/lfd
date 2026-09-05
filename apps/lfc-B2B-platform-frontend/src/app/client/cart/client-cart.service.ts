import { computed, effect, inject, Injectable } from '@angular/core';

import { type CartLine, type CartTotals, priceCart } from './cart-total';
import { CartStore } from './cart.store';
import { OrderContextStore } from '../order-context.store';
import { ShopCatalogue } from '../shop/shop-catalogue.store';

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
 * 1. **on n'ajoute que ce qui est au catalogue HYDRATÉ** — une référence
 *    inconnue est ignorée en silence plutôt que de rentrer dans un état qu'aucun
 *    écran ne saurait afficher. Tant que le catalogue n'est pas arrivé, rien ne
 *    s'ajoute : il n'y a alors aucun écran d'où le demander ;
 * 2. **une ligne à zéro n'existe pas** — retirer la dernière pièce retire la
 *    ligne, ce qui n'est pas la même chose que la garder à zéro ;
 * 3. **les lignes sortent dans l'ordre du RAYON**, pas dans celui des ajouts :
 *    le panier doit se relire comme la boutique se parcourt.
 */
@Injectable({ providedIn: 'root' })
export class ClientCart {
  private readonly store = inject(CartStore);
  private readonly order = inject(OrderContextStore);
  private readonly catalogue = inject(ShopCatalogue);

  constructor() {
    // Le catalogue arrive du réseau : l'élagage des références disparues ne peut
    // pas se faire à la relecture du stockage, il se fait ici, une fois qu'on
    // sait ce qui est encore en vente. Cf. `CartStore.keepOnly`.
    effect(() => {
      if (this.catalogue.status() === 'ready') {
        this.store.keepOnly(new Set(this.catalogue.items().map((item) => item.sku)));
      }
    });
  }

  /**
   * Les lignes, dans l'ordre du rayon — pas dans l'ordre des ajouts.
   *
   * Elles se projettent à travers le CATALOGUE : une référence qu'il ne connaît
   * pas — retirée de la vente, ou pas encore arrivée — n'a pas de ligne. C'est
   * ce qui rend l'élagage du stockage inoffensif quand il tarde.
   */
  readonly lines = computed<readonly CartLine[]>(() => {
    const quantities = this.store.quantities();
    return this.catalogue
      .items()
      .filter((item) => (quantities[item.sku] ?? 0) > 0)
      .map((product) => ({ product, quantity: quantities[product.sku] ?? 0 }));
  });

  /** Le nombre de PIÈCES, pas de références : c'est ce que le comptoir prépare. */
  readonly count = computed(() => this.lines().reduce((sum, l) => sum + l.quantity, 0));

  readonly isEmpty = computed(() => this.count() === 0);

  readonly totals = computed<CartTotals>(() => {
    const choice = this.order.choice();
    // Les frais du mode de service sont saisis en euros ; le décompte, lui,
    // compte en centimes. La conversion se fait ici, à la frontière.
    return priceCart(this.lines(), choice?.discount ?? 0, Math.round((choice?.fee ?? 0) * 100));
  });

  quantityOf(productId: string): number {
    return this.store.quantityOf(productId);
  }

  add(productId: string): void {
    if (this.catalogue.itemOf(productId) === null) {
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
