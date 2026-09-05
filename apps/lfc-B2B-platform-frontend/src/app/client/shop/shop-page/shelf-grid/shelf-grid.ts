import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { ClientCart } from '../../../cart/client-cart.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { ProductTile } from '../../product-tile/product-tile';
import type { ShopProduct } from '../../mock-shop';

/**
 * **La vitrine** — les pièces d'un rayon, ou ce qu'il faut lire quand il n'y en
 * a aucune.
 *
 * Trois colonnes plutôt qu'une : quatorze références en liste verticale font
 * quatorze écrans de pouce. En grille, six pièces sont visibles sans défiler, et
 * une boulangerie se regarde comme une vitrine.
 *
 * Elle prend le panier elle-même. Ajouter et retirer sont des gestes de la
 * VITRINE — la quantité s'affiche sur la pièce, à côté du bouton qui la change —
 * et les faire remonter à la page pour qu'elle les redescende n'aurait ajouté
 * que deux relais. Ce qu'elle ne fait pas, c'est ouvrir la fiche : la feuille
 * est un état de l'écran, pas de la grille.
 */
@Component({
  selector: 'app-shelf-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductTile],
  templateUrl: './shelf-grid.html',
  styleUrl: './shelf-grid.scss',
})
export class ShelfGrid {
  readonly products = input.required<readonly ShopProduct[]>();

  /** La pièce dont on veut la fiche. */
  readonly opened = output<string>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);
}
