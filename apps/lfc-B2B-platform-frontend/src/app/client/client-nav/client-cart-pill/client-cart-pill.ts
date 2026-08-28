import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import { formatEuro } from '../../cart-total';
import { ClientCart } from '../../client-cart.service';
import { ClientCopyService } from '../../copy/client-copy.service';

/**
 * Le panier, dans la barre d'app.
 *
 * Il a quitté la liste des destinations. Un panier n'est pas un endroit où l'on
 * va : c'est une quantité qui change en permanence, et qu'on veut voir sans
 * ouvrir de menu, depuis n'importe quel écran. Sa place est le chrome permanent.
 *
 * Deux formes, et la ligne qui les sépare est la PLACE, pas la largeur d'écran :
 * au repos il ne montre que sa pastille et son total ; vide, il se réduit au
 * glyphe. Pas de « 0 · 0,00 € » — la maison n'affiche pas de pastille à zéro,
 * et un panier vide n'a rien à annoncer, seulement à s'ouvrir.
 */
@Component({
  selector: 'app-client-cart-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, RouterLink],
  host: { '[class.is-full]': '!cart.isEmpty()' },
  templateUrl: './client-cart-pill.html',
  styleUrl: './client-cart-pill.scss',
})
export class ClientCartPill {
  protected readonly cart = inject(ClientCart);
  protected readonly t = inject(ClientCopyService).t;

  protected readonly total = computed(() => formatEuro(this.cart.totals().total));

  /** Le compte fait partie du NOM : sans lui, la pastille est muette. */
  protected readonly label = computed(() => {
    const name = this.t().nav.cart;
    const pieces = this.cart.count();
    return pieces === 0 ? name : `${name} — ${pieces}`;
  });
}
