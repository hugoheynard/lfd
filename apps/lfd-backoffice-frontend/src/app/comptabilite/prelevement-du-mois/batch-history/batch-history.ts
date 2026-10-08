import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { COLLECTION_BATCH_STATUS_LABELS, type CollectionBatchView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldPageSectionComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { batchMonthName } from '../../collection-month-wording';
import { day, euros } from '../../invoice-dossier-format';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'month', label: 'Mois' },
  { key: 'scheme', label: 'Schéma' },
  { key: 'status', label: 'État' },
  { key: 'collected', label: 'Date du prélèvement' },
  { key: 'lines', label: 'Payeurs · bons' },
  { key: 'amount', label: 'Montant', numeric: true },
  { key: 'files', label: 'Fichiers' },
];

/** Un téléchargement d'un lot passé : son fichier tel qu'il a été figé. */
export interface HistoryDownload {
  readonly batch: CollectionBatchView;
  readonly kind: 'xml' | 'csv';
}

/**
 * **L'historique des lots** — déposés et annulés, REPLIÉ : on y revient pour
 * retrouver un fichier, pas tous les jours. Les fichiers se relisent tels
 * qu'ils ont été figés.
 */
@Component({
  selector: 'app-batch-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './batch-history.html',
  styleUrl: './batch-history.scss',
})
export class BatchHistory {
  readonly batches = input.required<readonly CollectionBatchView[]>();

  readonly download = output<HistoryDownload>();

  protected readonly open = signal(false);
  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: CollectionBatchView): string => row.id;

  protected monthOf(row: CollectionBatchView): string {
    return batchMonthName(row.cycleClosesAt);
  }

  protected statusOf(row: CollectionBatchView): string {
    return COLLECTION_BATCH_STATUS_LABELS[row.status];
  }

  protected collectedOn(row: CollectionBatchView): string {
    return row.requestedCollectionDay === null ? '—' : day(row.requestedCollectionDay);
  }

  protected cents(amount: number): string {
    return euros(amount);
  }
}
