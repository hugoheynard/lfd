import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { AdminOrderEstimateView, PickupAddressView } from '@lfd/contracts';

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
 * « Enregistrer le brouillon » n'y est pas : il reste dans l'en-tête de la
 * page à toutes les largeurs, toujours visible (sur iPad, la barre collée en
 * bas pouvait sortir de l'écran).
 */
@Component({
  selector: 'app-barre-panier',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './barre-panier.html',
  styleUrl: './barre-panier.scss',
})
export class BarrePanier {
  readonly cart = input.required<CartStore>();
  readonly open = output<void>();

  protected readonly count = computed(() => this.cart().itemCount());
  /** Le brouillon et les points : le règlement et le retrait que le total lit. */
  readonly draft = input.required<DraftStore>();
  readonly pickups = input.required<readonly PickupAddressView[]>();
  /** L'estimation du serveur, ou `null` — la barre ne montre alors aucun montant. */
  readonly estimate = input<AdminOrderEstimateView | null>(null);

  /**
   * « Total HT 12,34 € » au compte, « Total TTC … » au lien ; rien sans
   * estimation (Hugo, 2026-11-21) : la barre dit alors seulement ce qu'elle
   * ouvre, et le panier dit lui-même pourquoi le prix attend.
   */
  protected readonly total = computed<string | null>(() => {
    const fulfillment = this.draft().fulfillment();
    const rows = estimateRowsOf(this.estimate()?.amounts ?? null, {
      settlement: this.draft().settlement(),
      method: fulfillment?.method ?? 'pickup',
      pickupAddressId: fulfillment?.pickupAddressId ?? null,
      pickups: this.pickups(),
    });
    const row = rows?.find((candidate) => candidate.key === 'total');
    return row === undefined ? null : `${row.label} ${row.value}`;
  });
}
