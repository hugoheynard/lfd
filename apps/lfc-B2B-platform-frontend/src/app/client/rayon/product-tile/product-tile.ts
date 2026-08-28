import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { formatEuro } from '../../../client/cart-total';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import type { ShopProduct } from '../../../client/mock-shop';

/**
 * Une pièce du rayon — la vignette de la grille.
 *
 * Elle porte DEUX gestes à la même place, et c'est tout son propos : le « + »
 * posé sur la photo ajoute sans quitter le rayon (le geste de l'habitué), la
 * vignette ouvre la fiche (le geste de celui qui veut savoir). Deux vitesses,
 * aucun menu.
 *
 * La densité change avec le pli, pas le modèle. En pile, la tuile fait ~112 px :
 * un stepper à trois zones y donnerait des cibles de 24 px, donc le bouton
 * devient une pastille qui porte la quantité et le retrait se fait dans la
 * fiche. Au-delà du pli la tuile fait ~166 px, le stepper complet y tient. Les
 * deux vivent dans le DOM et c'est le CSS qui choisit — le pli est une affaire
 * de largeur, que le rendu serveur ne connaît pas.
 */
@Component({
  selector: 'app-product-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './product-tile.html',
  styleUrl: './product-tile.scss',
})
export class ProductTile {
  readonly product = input.required<ShopProduct>();

  /** Ce qu'il y a déjà au panier. Zéro : la pastille redevient un « + ». */
  readonly quantity = input(0);

  readonly opened = output<void>();
  readonly added = output<void>();
  readonly removed = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  protected readonly price = computed(() => formatEuro(this.product().price));

  protected readonly addLabel = computed(() =>
    fill(this.t().shop.addAria, { name: this.product().name }),
  );

  protected readonly removeLabel = computed(() =>
    fill(this.t().shop.removeAria, { name: this.product().name }),
  );
}
