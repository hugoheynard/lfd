import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CustomerOrderView } from '@lfd/contracts';
import { FoldBadgeComponent } from 'fold-ng';

import {
  formatCents,
  formatOrderDate,
  isPricedOrder,
  orderHeaderTotal,
  orderStatusLabel,
  orderStatusVariant,
  settlementStatusLabel,
  settlementStatusVariant,
} from '../order-format';

/**
 * **L'en-tête d'une commande** — la référence, les dates, le statut, le
 * règlement et le montant.
 *
 * Un composant à part pour qu'il se rende à deux endroits sans que son calcul
 * soit recopié : dans le détail (`lfd-order-detail`, la boutique), et dans la
 * bande de tête du back-office, qui tait celui du détail.
 */
@Component({
  selector: 'lfd-order-detail-head',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
  templateUrl: './order-detail-head.html',
  styleUrl: './order-detail-head.scss',
})
export class OrderDetailHead {
  readonly order = input.required<CustomerOrderView>();

  protected readonly statusLabel = computed(() => orderStatusLabel(this.order().status));
  protected readonly statusVariant = computed(() => orderStatusVariant(this.order().status));
  protected readonly paymentLabel = computed(() => settlementStatusLabel(this.order()));
  protected readonly paymentVariant = computed(() => settlementStatusVariant(this.order()));

  /** Le total de l'en-tête et son assiette — cf. `orderHeaderTotal`. */
  protected readonly headerTotal = computed(() => orderHeaderTotal(this.order()));
  /** Une commande interne ne montre pas de montant : le badge du règlement le dit. */
  protected readonly priced = computed(() => isPricedOrder(this.order()));

  protected fmtCents(cents: number): string {
    return formatCents(cents);
  }

  protected fmtDate(iso: string): string {
    return formatOrderDate(iso);
  }
}
