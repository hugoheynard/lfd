import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CollectionBatchLineView, CollectionBatchView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { batchMonthName, ofMonth } from '../../collection-month-wording';
import { noticeBadge, type NoticeBadge } from '../../collection-notice-wording';
import { euros, signedEuros } from '../../invoice-dossier-format';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'rank', label: 'Ligne', numeric: true },
  { key: 'debtor', label: 'Débiteur' },
  { key: 'orders', label: 'Σ bons', numeric: true },
  { key: 'billed', label: 'Total facturé (prélevé)', numeric: true },
  { key: 'gap', label: 'Écart', numeric: true },
  { key: 'notice', label: 'Avis de prélèvement' },
  { key: 'statement', label: 'Pièce' },
];

/** Ce que la ligne dit — un lot d'avant l'arrêté n'a ni Σ bons, ni écart, ni dossier. */
export interface BatchLineRow {
  readonly rank: number;
  readonly debtorName: string;
  readonly billed: string;
  /** `null` : lot d'avant l'arrêté de facturation — jamais un zéro. */
  readonly orders: string | null;
  readonly gap: string | null;
  readonly statementId: string | null;
  /** Les factures émises que la ligne encaisse (E4) ; vide pour une ligne d'arrêté. */
  readonly invoiceNumbers: readonly string[];
  /** L'état de l'avis (PA2) — envoyé, en attente, échec, non envoyable. */
  readonly notice: NoticeBadge;
}

/**
 * Les lignes d'un lot (plan `plan-le-prelevement-suit-la-facture.md`, F4) :
 * depuis E4 (plan `plan-emission-de-la-facture.md`), une ligne encaisse des
 * factures émises et les cite par leur numéro ; les lignes d'arrêté restent
 * lisibles telles quelles.
 * ce que les bons totalisent, ce qui est facturé — donc prélevé — et l'écart
 * signé entre les deux. Rien n'est calculé ici que cette soustraction : les
 * deux montants sont figés sur la ligne.
 */
@Component({
  selector: 'app-batch-lines',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    RouterLink,
  ],
  templateUrl: './batch-lines.html',
  styleUrl: './batch-lines.scss',
})
export class BatchLines {
  readonly batch = input.required<CollectionBatchView>();

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: BatchLineRow): string => String(row.rank);

  protected readonly title = computed(() => {
    const batch = this.batch();
    return `Lignes du lot ${ofMonth(batchMonthName(batch.cycleClosesAt))} — ${batch.scheme}`;
  });

  protected readonly rows = computed(() => this.batch().lines.map(toRow));
}

export function toRow(line: CollectionBatchLineView): BatchLineRow {
  const head = {
    rank: line.rank,
    debtorName: line.debtorName,
    billed: euros(line.amountCents),
    notice: noticeBadge(line.notice),
  };
  const ordersTotal = line.ordersTotalCents;
  const invoiceNumbers = line.invoiceNumbers;
  const settled = line.billingStatementId !== null || invoiceNumbers.length > 0;
  if (ordersTotal === null || !settled) {
    return { ...head, orders: null, gap: null, statementId: null, invoiceNumbers: [] };
  }
  return {
    ...head,
    orders: euros(ordersTotal),
    gap: signedEuros(line.amountCents - ordersTotal),
    statementId: line.billingStatementId,
    invoiceNumbers,
  };
}
