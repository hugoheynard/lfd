import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';
import { formatCents } from '@lfd/b2b-ui/order';

import type { CartStore } from '../cart.store';

/**
 * La barre du bas, en mobile : **ce que contient le panier, et comment l'ouvrir**.
 *
 * Sur un écran étroit, la colonne de droite poussait les sources hors de vue ;
 * repliée en tiroir, elle ne dit plus rien tant qu'on ne l'ouvre pas. Cette
 * barre est ce qui reste visible : le nombre d'articles et le sous-total HT —
 * les deux chiffres qu'on annonce au téléphone — et une cible large pour
 * ouvrir.
 *
 * À côté, **enregistrer le brouillon** : un appel s'interrompt, et rien n'oblige
 * à finir la commande dans la minute. Le bouton est au même niveau que le
 * panier parce qu'il répond à la même question — « qu'est-ce que je fais de ce
 * que je viens de saisir ? ».
 */
@Component({
  selector: 'app-barre-panier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './barre-panier.html',
  styleUrl: './barre-panier.scss',
})
export class BarrePanier {
  readonly cart = input.required<CartStore>();
  /** Vrai pendant l'enregistrement du brouillon — le bouton le dit. */
  readonly saving = input(false);

  readonly open = output<void>();
  readonly save = output<void>();

  protected readonly count = computed(() => this.cart().itemCount());
  protected readonly subtotal = computed(() => formatCents(this.cart().subtotalCents()));
}
