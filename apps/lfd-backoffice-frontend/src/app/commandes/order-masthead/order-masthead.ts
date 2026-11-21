import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  formatCents,
  orderHeaderTotal,
  orderStatusLabel,
  orderStatusVariant,
  settlementStatusLabel,
  settlementStatusVariant,
} from '@lfd/b2b-ui/order';
import type { AdminOrderView } from '@lfd/contracts';
import { FoldBadgeComponent } from 'fold-ng';

import { orderHeader } from '../order-header';

/**
 * **La bande de tête d'une commande, vue du staff.** Dans l'ordre où on la
 * lit : qui, où elle en est et combien, puis comment et quel jour elle part.
 * Les dates de passation et le contact se lisent ailleurs sur la page.
 *
 * Propre au back-office : la boutique garde l'en-tête du détail partagé. Les
 * mots du statut, du règlement et du montant viennent des mêmes fonctions de
 * `@lfd/b2b-ui` que lui — rien n'est recopié.
 */
@Component({
  selector: 'app-order-masthead',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
  templateUrl: './order-masthead.html',
  styleUrl: './order-masthead.scss',
})
export class OrderMasthead {
  readonly order = input.required<AdminOrderView>();

  protected readonly header = computed(() => orderHeader(this.order()));

  protected readonly total = computed(() => {
    const total = orderHeaderTotal(this.order());
    return { value: formatCents(total.cents), basis: total.basis };
  });

  protected readonly statusLabel = computed(() => orderStatusLabel(this.order().status));
  protected readonly statusVariant = computed(() => orderStatusVariant(this.order().status));
  protected readonly paymentLabel = computed(() => settlementStatusLabel(this.order()));
  protected readonly paymentVariant = computed(() => settlementStatusVariant(this.order()));
}
