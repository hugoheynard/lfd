import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AdminOrderView } from '@lfd/contracts';
import { formatCents, SectionTitle } from '@lfd/b2b-ui/order';
import { FoldCardComponent, FoldFieldComponent, FoldFieldListComponent } from 'fold-ng';

/** Les deux colonnes de la carte : ce qui a été commandé, ce qui se facture. */
interface AmountRows {
  readonly orderedPretax: string;
  readonly orderedTotal: string;
  /** `null` tant que la commande n'est pas soldée : « au solde ». */
  readonly delivered: { readonly pretax: string; readonly total: string } | null;
}

/**
 * **Commandé et livré** (`documentation/commandes/reliquat/reliquat.md`, § 7) — sur une commande
 * au départ décidé, les totaux de la commande (le « commandé ») à côté des
 * montants facturables (`billable`, le « livré »), posés au solde. Avant le
 * solde, le livré le dit. Rien sans décision : une commande partie entière
 * n'a qu'un montant.
 */
@Component({
  selector: 'app-order-delivered-amounts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldFieldComponent, FoldFieldListComponent, SectionTitle],
  templateUrl: './order-delivered-amounts.html',
})
export class OrderDeliveredAmounts {
  readonly order = input.required<AdminOrderView>();

  protected readonly rows = computed<AmountRows | null>(() => {
    const order = this.order();
    if (order.shortfall?.decision == null) {
      return null;
    }
    const billable = order.billable ?? null;
    return {
      orderedPretax: formatCents(order.subtotalCents),
      orderedTotal: formatCents(order.totalCents),
      delivered:
        billable === null
          ? null
          : {
              pretax: formatCents(billable.subtotalCents),
              total: formatCents(billable.totalCents),
            },
    };
  });
}
