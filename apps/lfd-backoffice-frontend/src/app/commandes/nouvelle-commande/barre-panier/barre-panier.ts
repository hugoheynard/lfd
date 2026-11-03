import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';
import type { AdminOrderEstimateView, PickupAddressView } from '@lfd/contracts';
import { formatCents } from '@lfd/b2b-ui/order';

import type { CartStore } from '../cart.store';
import type { DraftStore } from '../draft.store';
import { estimateRowsOf } from '../order-estimate';

/**
 * La barre du bas, en mobile : **ce que contient le panier, et comment l'ouvrir**.
 *
 * Sur un écran étroit, la colonne de droite poussait les sources hors de vue ;
 * repliée en tiroir, elle ne dit plus rien tant qu'on ne l'ouvre pas. Cette
 * barre est ce qui reste visible : le nombre d'articles et le total — celui
 * de `orderTotalRows`, au compte le « Total HT », au lien le « Total TTC » ;
 * le sous-total HT tant que l'estimation n'est pas revenue — et une cible
 * large pour ouvrir.
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
  /** Le brouillon et les points : le règlement et le retrait que le total lit. */
  readonly draft = input.required<DraftStore>();
  readonly pickups = input.required<readonly PickupAddressView[]>();
  /** L'estimation du serveur, ou `null` — le sous-total HT s'affiche alors. */
  readonly estimate = input<AdminOrderEstimateView | null>(null);

  /** « Total HT 12,34 € » au compte, « Total TTC … » au lien, « Sous-total HT … » sans estimation. */
  protected readonly total = computed(() => {
    const fulfillment = this.draft().fulfillment();
    const rows = estimateRowsOf(this.estimate()?.amounts ?? null, {
      settlement: this.draft().settlement(),
      method: fulfillment?.method ?? 'pickup',
      pickupAddressId: fulfillment?.pickupAddressId ?? null,
      pickups: this.pickups(),
    });
    const row = rows?.find((candidate) => candidate.key === 'total');
    return row === undefined
      ? `Sous-total HT ${formatCents(this.cart().subtotalCents())}`
      : `${row.label} ${row.value}`;
  });
}
