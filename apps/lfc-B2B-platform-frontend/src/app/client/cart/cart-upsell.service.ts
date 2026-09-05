import { computed, inject, Injectable } from '@angular/core';

import { CartStore } from './cart.store';
import { ShopCatalogue } from '../shop/shop-catalogue.store';

/**
 * Ce qu'on propose en relance : ce qui se rajoute par gourmandise, pas par
 * besoin — le chocolat et la pâtisserie.
 *
 * ⚠️ Les identifiants sont ceux du RÉFÉRENTIEL, et c'est une règle de vente
 * écrite ici faute d'endroit où la poser là-bas. Le jour où une famille peut se
 * déclarer « gourmandise », cette liste disparaît. Un rayon renommé ne la casse
 * pas ; un rayon supprimé la rend simplement muette, ce qui est le bon défaut.
 */
const TREATS: readonly string[] = ['cat_choco', 'cat_patis'];

/**
 * **La relance** — la gourmandise qu'on propose d'ajouter au panier.
 *
 * Un service à part, et pas une propriété de plus sur le panier : c'est une
 * règle de VENTE, pas une règle de panier. Elle change pour des raisons qui ne
 * regardent ni l'état ni les lignes — une saison, une opération, un jour de
 * l'année — et un panier qui la portait donnait une seconde raison de changer à
 * la classe dont dépend tout le reste de la boutique.
 *
 * Il ne lit que l'état, et n'écrit rien : proposer et ajouter sont deux gestes,
 * et c'est le second que le client déclenche. L'ajout reste donc au panier.
 */
@Injectable({ providedIn: 'root' })
export class CartUpsell {
  private readonly store = inject(CartStore);
  private readonly catalogue = inject(ShopCatalogue);

  /**
   * La première gourmandise ABSENTE du panier.
   *
   * Jamais un produit déjà dedans — proposer ce qu'on a déjà se lit comme un
   * bug —, et `null` quand il n'y a plus rien à proposer : la carte disparaît
   * alors au lieu de tourner à vide.
   */
  readonly suggestion = computed(() => {
    const quantities = this.store.quantities();
    return (
      this.catalogue
        .items()
        .find((item) => TREATS.includes(item.shelfId) && (quantities[item.sku] ?? 0) === 0) ?? null
    );
  });
}
