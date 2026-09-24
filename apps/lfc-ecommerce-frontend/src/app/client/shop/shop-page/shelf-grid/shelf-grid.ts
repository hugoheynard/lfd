import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { ClientCart } from '../../../cart/client-cart.service';
import { ClientCopyService } from '../../../copy/client-copy.service';
import { ClientFeatureAccess } from '../../../feature-access/client-feature-access.service';
import { type PlacedShelfFeature } from '../../mock-shelf-feature';
import { ProductTile } from '../../product-tile/product-tile';
import { ShelfFeatureTile } from '../shelf-feature-tile/shelf-feature-tile';
import type { ShopItemView } from '@lfd/contracts';

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
  imports: [ProductTile, ShelfFeatureTile],
  templateUrl: './shelf-grid.html',
  styleUrl: './shelf-grid.scss',
})
export class ShelfGrid {
  readonly products = input.required<readonly ShopItemView[]>();

  /**
   * Les mises en avant, dans l'ordre — vide pour ne rien poser. C'est la PAGE
   * qui décide où elles se montrent (sur « Tout » seulement) : la grille ne
   * sait pas quel rayon elle affiche. Le format décide de la case : la tuile
   * et le bloc en tête du flux, la bande en troisième rangée.
   */
  readonly features = input<readonly PlacedShelfFeature[]>([]);

  /** La pièce dont on veut la fiche. */
  readonly opened = output<string>();

  /** Le rayon qu'ouvre une mise en avant. */
  readonly shelfOpened = output<string>();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);
  /** Au niveau `browse` exactement, le rayon se visite sans panier (plan §4). */
  protected readonly access = inject(ClientFeatureAccess);
}
