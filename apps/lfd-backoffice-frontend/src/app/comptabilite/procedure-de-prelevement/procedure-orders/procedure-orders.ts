import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProcedureOrderStatusView, ProcedureOrderView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { day, euros } from '../../invoice-dossier-format';
import { STATUS_LABELS } from '../procedure-invoices-step/procedure-invoices-wording';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'order', label: 'Commande' },
  { key: 'company', label: 'Client' },
  { key: 'day', label: 'Jour' },
  { key: 'total', label: 'Montant TTC', numeric: true },
  { key: 'status', label: 'Statut' },
  { key: 'gesture', label: '' },
];

const STATUS_VARIANTS: Readonly<Record<ProcedureOrderStatusView, 'warning' | 'info' | 'success'>> =
  {
    receipt_to_confirm: 'warning',
    receipt_confirmed: 'info',
    invoiced: 'success',
    awaiting_remainder: 'info',
  };

/**
 * **Les commandes de la période, un statut chacune** (onglet « Factures »,
 * Hugo, 2026-10-24). Le statut vient du serveur ; une commande facturée dit
 * son numéro de facture, une réception confirmée sans jour de réception le
 * dit (« à reprendre »), une réception à confirmer porte son geste : la
 * commande, où l'on enregistre la remise — retrait ou livraison. Une commande
 * en partie retirée dit le jour de son reste quand il est connu (décision de
 * Hugo du 2026-10-26).
 */
@Component({
  selector: 'app-procedure-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
  ],
  templateUrl: './procedure-orders.html',
})
export class ProcedureOrders {
  readonly orders = input.required<readonly ProcedureOrderView[]>();

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: { readonly orderId: string }): string => row.orderId;

  /** Les lignes telles que la table les écrit — le gabarit n'indexe rien. */
  protected readonly rows = computed(() =>
    this.orders().map((order) => ({
      ...order,
      day: order.serviceDay === null ? '—' : day(order.serviceDay),
      total: euros(order.totalCents),
      statusLabel: STATUS_LABELS[order.status],
      remainderDay: order.remainderPlannedOn === null ? null : day(order.remainderPlannedOn),
      statusVariant: STATUS_VARIANTS[order.status],
    })),
  );
}
