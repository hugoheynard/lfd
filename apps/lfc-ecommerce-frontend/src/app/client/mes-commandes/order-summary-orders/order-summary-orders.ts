import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { CompanyOrderSummaryView } from '@lfd/contracts';
import {
  FoldDataTableComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { formatCents } from '../../format-money';
import type { SummaryBottomLine } from '../order-summary-format';
import {
  authorLabel,
  modeLabel,
  orderDayLabel,
  ordersFootLines,
} from '../order-summary-orders-format';

/** Un bon, tel que la table le montre. */
interface OrderRow {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly day: string;
  readonly mode: string;
  readonly author: string;
  readonly pretax: string;
}

/** Les bons d'une société, et leur pied. */
interface OrdersBlock {
  readonly companyId: string;
  readonly name: string;
  readonly rows: readonly OrderRow[];
  readonly foot: readonly SummaryBottomLine[];
}

/**
 * **Les bons de commande inclus** du récapitulatif (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, §10) —
 * repliés par défaut : le récapitulatif se lit d'abord, la liste sert à
 * pointer.
 *
 * Une table par société, dans l'ordre des tables du récapitulatif (le titre
 * nomme le site) : bon, jour, mode, auteur, et le HT que le bon imprime —
 * jamais de TVA ni de TTC par bon. Sous chaque table, la somme des bons et,
 * s'il y en a un, l'écart avec le sous-total HT, expliqué ; avec plusieurs
 * sociétés, la somme de tous les bons.
 */
@Component({
  selector: 'app-order-summary-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldDataTableComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    NgTemplateOutlet,
  ],
  templateUrl: './order-summary-orders.html',
  styleUrl: './order-summary-orders.scss',
})
export class OrderSummaryOrders {
  readonly summary = input.required<CompanyOrderSummaryView>();

  private readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);

  protected readonly copy = computed(() => this.t().orders.summary);

  protected readonly blocks = computed<readonly OrdersBlock[]>(() => {
    const copy = this.copy();
    const locale = this.locale.current();
    return this.summary().companies.map((company) => ({
      companyId: company.companyId,
      name: company.name,
      rows: company.orders.map((order) => ({
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        day: orderDayLabel(order.day, copy, locale),
        mode: modeLabel(order.fulfillmentMethod, copy),
        author: authorLabel(order.author, copy),
        pretax: formatCents(order.pretaxCents),
      })),
      foot: ordersFootLines(company, copy),
    }));
  });

  /** La somme de tous les bons — seulement s'il y a plusieurs sociétés. */
  protected readonly totalFoot = computed<readonly SummaryBottomLine[]>(() => {
    const summary = this.summary();
    const copy = this.copy();
    return summary.companies.length > 1
      ? ordersFootLines(summary.total, copy, `${copy.ordersPretax} — ${copy.grandTotal}`)
      : [];
  });

  protected readonly columns = computed<readonly FoldTableColumn<OrderRow>[]>(() => {
    const copy = this.copy();
    return [
      { key: 'orderNumber', label: copy.colOrder, value: (row) => row.orderNumber },
      { key: 'day', label: copy.colDay, value: (row) => row.day },
      { key: 'mode', label: copy.colMode, value: (row) => row.mode },
      { key: 'author', label: copy.colAuthor, value: (row) => row.author },
      { key: 'pretax', label: copy.colHt, numeric: true, value: (row) => row.pretax },
    ];
  });

  protected readonly rowKey = (row: OrderRow): string => row.orderId;
}
