import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { COLLECTION_EXCLUSION_REASON_LABELS, type CollectionExclusionView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'order', label: 'Bon' },
  { key: 'company', label: 'Société' },
  { key: 'amount', label: 'Montant' },
  { key: 'reason', label: 'Raison' },
  { key: 'actions', label: '' },
];

/**
 * **Les bons écartés** à la dernière préparation, et leur raison : ils
 * reviennent au lot suivant une fois corrigés, ou se règlent autrement — la
 * page ouvre le panneau, ce composant ne fait que le demander.
 */
@Component({
  selector: 'app-excluded-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './excluded-orders.html',
  styleUrl: './excluded-orders.scss',
})
export class ExcludedOrders {
  readonly exclusions = input.required<readonly CollectionExclusionView[]>();
  readonly canWrite = input(false);

  readonly settle = output<CollectionExclusionView>();

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: CollectionExclusionView): string => row.orderId;

  protected reasonOf(row: CollectionExclusionView): string {
    return COLLECTION_EXCLUSION_REASON_LABELS[row.reason];
  }

  protected cents(amount: number): string {
    return formatCents(amount);
  }

  protected dateOf(iso: string): string {
    return formatOrderDate(iso);
  }
}
