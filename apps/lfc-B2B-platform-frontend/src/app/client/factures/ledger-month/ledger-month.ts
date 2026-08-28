import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { formatEuro } from '../../cart-total';
import { ClientCopyService } from '../../copy/client-copy.service';
import type { LedgerMonth, LedgerRegister } from '../../mock-statement';

/**
 * Un MOIS du relevé — le rail, puis ses deux registres.
 *
 * Le mois est le grain de lecture : c'est lui qui porte sa date de clôture, son
 * export et, quand elle existe, sa facture. L'exercice, lui, ne fait que
 * couper — une rupture d'année, pas un niveau de plus.
 *
 * **Les deux registres ne se mélangent jamais.** « Au compte » part sur la
 * facture du mois, « à la commande » est déjà réglé : les additionner serait
 * faux, donc chaque colonne porte son propre total et aucun total général
 * n'existe sur cet écran.
 */
@Component({
  selector: 'app-ledger-month',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  host: { '[class.open]': 'month().open' },
  templateUrl: './ledger-month.html',
  styleUrl: './ledger-month.scss',
})
export class LedgerMonthRow {
  readonly month = input.required<LedgerMonth>();

  protected readonly t = inject(ClientCopyService).t;

  protected readonly account = computed(() => this.register(this.month().account));
  protected readonly perOrder = computed(() => {
    const register = this.month().perOrder;
    return register === null ? null : this.register(register);
  });

  protected readonly invoiceTotal = computed(() => {
    const invoice = this.month().invoice;
    return invoice === null ? '' : formatEuro(invoice.total);
  });

  private register(register: LedgerRegister): {
    readonly total: string;
    readonly count: string;
    readonly orders: readonly { reference: string; day: string; amount: string; method: string }[];
  } {
    return {
      total: formatEuro(register.total),
      count: this.t().invoices.ordersCount.replace('{n}', String(register.orders.length)),
      orders: register.orders.map((order) => ({
        reference: order.reference,
        day: order.day,
        amount: formatEuro(order.amount),
        method: order.method,
      })),
    };
  }
}
