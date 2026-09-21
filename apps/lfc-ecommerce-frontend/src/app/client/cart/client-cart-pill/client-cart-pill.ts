import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldIconComponent, FoldPanelHostService } from 'fold-ng';

import { formatCents } from '../../format-money';
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
 * ## 🔴 UN SEUL GESTE depuis le 2026-09-21
 *
 * Il en avait deux, et le pli tranchait : un popover au bureau, un lien vers la
 * page en pile. La raison écrite pour le lien était qu'« un panneau de 372 px
 * sur un téléphone n'est pas un panneau, c'est la page entière en plus petit —
 * et la page panier existe déjà ». Elle était à moitié circulaire : on gardait
 * la page parce que la page existait. La page n'existe plus, et la feuille du
 * bas monte jusqu'à l'en-tête — elle a donc la hauteur qu'on lui reprochait de
 * ne pas avoir.
 *
 * Ce que le popover perd, et qui est assumé : il se lisait sans rien ouvrir de
 * modal. Mais il ne montrait qu'un extrait, et son pied menait de toute façon
 * au panier entier.
 */
@Component({
  selector: 'app-client-cart-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  host: { '[class.is-full]': '!cart.isEmpty()' },
  templateUrl: './client-cart-pill.html',
  styleUrl: './client-cart-pill.scss',
})
export class ClientCartPill {
  private readonly panels = inject(FoldPanelHostService);

  protected readonly cart = inject(ClientCart);
  protected readonly t = inject(ClientCopyService).t;

  protected readonly total = computed(() => formatCents(this.cart.totals().totalCents));

  /** Le compte fait partie du NOM : sans lui, la pastille est muette. */
  protected readonly label = computed(() => {
    const name = this.t().nav.cart;
    const pieces = this.cart.count();
    return pieces === 0 ? name : `${name} — ${pieces}`;
  });

  /** Partir régler referme le panneau : le lien a fait son travail. */

  /**
   * Ouvre le panier par-dessus l'écran où l'on est.
   *
   * 🔴 **CHARGÉ À LA DEMANDE, et ce n'est pas un raffinement.** Cette pastille
   * vit dans le SHELL, donc dans le bundle initial. Un `import` statique du
   * dialogue y faisait entrer tout ce qu'il touche — le service de commandes,
   * le dialogue d'identité, le devis — et le budget de la configuration
   * `cloudflare` est passé de vert à **313 ko au-dessus de la limite**, en
   * ERREUR. Constaté au build le 2026-09-21 : ni le typecheck ni les tests ne
   * le voient, seul le build le dit.
   *
   * ⚠️ Ne pas « simplifier » en remontant l'import en tête de fichier.
   */
  protected async openCart(): Promise<void> {
    const { CartDialog } = await import('../cart-dialog/cart-dialog');
    CartDialog.open(this.panels);
  }
}
