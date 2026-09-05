import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { formatCents } from '../../../client/format-money';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import type { ShopItemView } from '@lfd/contracts';
import { unitPriceCents } from '@lfd/money';

import { artOf } from '../shelf-display';

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
  readonly product = input.required<ShopItemView>();

  /** Ce qu'il y a déjà au panier. Zéro : la pastille redevient un « + ». */
  readonly quantity = input(0);

  readonly opened = output<void>();
  readonly added = output<void>();
  readonly removed = output<void>();

  protected readonly t = inject(ClientCopyService).t;

  /**
   * Le prix **hors taxe**, mention comprise.
   *
   * Un prix alimentaire affiché sans mention se lit TTC en France : `1,00 €` sur
   * une vignette qui pense HT ment à son lecteur. La mention n'est donc pas une
   * décoration mais la seule chose qui rend l'affichage exact — et la boutique
   * s'adresse à des professionnels, qui raisonnent en HT.
   */
  protected readonly price = computed(() =>
    fill(this.t().shop.priceHt, {
      price: formatCents(unitPriceCents(this.product().unitPriceMillicents)),
    }),
  );

  /** Le visuel du référentiel, ou l'illustration de son rayon. */
  protected readonly art = computed(() => artOf(this.product()));

  protected readonly addLabel = computed(() =>
    fill(this.t().shop.addAria, { name: this.product().name }),
  );

  protected readonly removeLabel = computed(() =>
    fill(this.t().shop.removeAria, { name: this.product().name }),
  );
}
