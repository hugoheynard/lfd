import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldIconComponent, FoldPopoverComponent, FoldPopoverTriggerDirective } from 'fold-ng';

import { formatCents } from '../../format-money';
import { CartSummary } from '../cart-summary/cart-summary';
import { ClientCart } from '../client-cart.service';
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
 *
 * ## 🔴 Deux gestes, et le pli tranche (2026-09-20)
 *
 * Au **bureau**, c'est un popover : la même grammaire que la cloche et le menu
 * d'espaces (`_popover.scss`), avec le décompte dedans et le règlement en pied.
 * On relit son panier sans quitter le rayon — ce qui est tout l'intérêt.
 *
 * **En dessous du pli, il reste le lien qu'il était.** Un panneau de 372 px sur
 * un téléphone n'est pas un panneau, c'est la page entière en plus petit — et
 * la page panier existe déjà, avec la place d'y ajuster des quantités.
 *
 * Les deux vivent dans le DOM et le CSS choisit, comme le menu de poche et la
 * marque de la barre : le pli est une affaire de largeur, que le rendu serveur
 * ne connaît pas. Ce que les deux montrent — la pastille, le total — est un
 * `<ng-template>` unique : deux copies seraient deux occasions de diverger.
 */
@Component({
  selector: 'app-client-cart-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CartSummary,
    FoldIconComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
    NgTemplateOutlet,
    RouterLink,
  ],
  host: { '[class.is-full]': '!cart.isEmpty()' },
  templateUrl: './client-cart-pill.html',
  styleUrl: './client-cart-pill.scss',
})
export class ClientCartPill {
  protected readonly cart = inject(ClientCart);
  protected readonly t = inject(ClientCopyService).t;

  protected readonly open = signal(false);

  protected readonly total = computed(() => formatCents(this.cart.totals().totalCents));

  /** Le compte fait partie du NOM : sans lui, la pastille est muette. */
  protected readonly label = computed(() => {
    const name = this.t().nav.cart;
    const pieces = this.cart.count();
    return pieces === 0 ? name : `${name} — ${pieces}`;
  });

  /** Partir régler referme le panneau : le lien a fait son travail. */
  protected close(): void {
    this.open.set(false);
  }
}
