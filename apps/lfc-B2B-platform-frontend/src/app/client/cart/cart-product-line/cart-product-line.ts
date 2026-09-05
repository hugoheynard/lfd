import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { unitPriceCents } from '@lfd/money';

import { formatCents } from '../../format-money';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { type CartLine, lineHtCents } from '../cart-total';

/**
 * **Une ligne du panier** : la quantité, ce que c'est, ce que ça fait.
 *
 * Le sélecteur est `li[app-cart-product-line]` et non un élément à lui : la
 * liste est un `<ul>`, dont les seuls enfants valides sont des `<li>`. Un
 * élément intermédiaire obligerait à un `display: contents` pour rendre la
 * grille — et ce contournement retire l'élément de l'arbre d'accessibilité chez
 * certains lecteurs d'écran, donc la liste n'annoncerait plus ses items.
 * L'attribut règle le problème au lieu de le déplacer.
 *
 * Elle formate ses propres montants plutôt que de recevoir des chaînes : c'est
 * la seule façon que la mention `HT` soit posée là où le prix s'affiche. Un
 * parent qui préformate est un parent qui peut oublier la mention, et rien ne
 * le lui dirait.
 *
 * ⚠️ Le trait qui la sépare de la suivante appartient à la LISTE, pas à elle —
 * une ligne ne connaît pas sa voisine, et un composant ne pose pas son écart.
 */
@Component({
  selector: 'li[app-cart-product-line]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cart-product-line.html',
  styleUrl: './cart-product-line.scss',
})
export class CartProductLine {
  readonly line = input.required<CartLine>();

  private readonly t = inject(ClientCopyService).t;

  protected readonly name = computed(() => this.line().product.name);

  protected readonly quantity = computed(() => this.line().quantity);

  /** Le prix d'UNE pièce, hors taxe, mention comprise. */
  protected readonly unit = computed(() =>
    fill(this.t().shop.priceHt, {
      price: formatCents(unitPriceCents(this.line().product.unitPriceMillicents)),
    }),
  );

  /**
   * Le total de la ligne, hors taxe.
   *
   * L'arrondi a lieu ICI, sur la quantité entière — jamais sur l'unité
   * multipliée : deux fois « 1,40 € » ne font pas forcément le total de deux
   * pièces, et c'est tout ce que le millicentime existe pour tenir.
   */
  protected readonly sum = computed(() => formatCents(lineHtCents(this.line())));
}
