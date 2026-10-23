import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type {
  CollectionReturnImportReportView,
  ImportReportEntryView,
  SetAsideImportReportEntryView,
} from '@lfd/contracts';
import {
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { day, euros } from '../../invoice-dossier-format';

const NOT_FOUND_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'endToEndId', label: 'EndToEndId' },
  { key: 'rum', label: 'RUM' },
  { key: 'amount', label: 'Montant', numeric: true },
  { key: 'day', label: 'Date' },
];

const SET_ASIDE_COLUMNS: readonly FoldTableColumn[] = [
  ...NOT_FOUND_COLUMNS,
  { key: 'problem', label: 'Pourquoi' },
];

/** Une case du compte rendu : un nombre, et ce qu'il compte. */
interface ReportFigure {
  readonly key: string;
  readonly count: number;
  readonly label: string;
}

/**
 * **Le compte rendu d'un import** de retours (Hugo, 2026-10-23) : combien de
 * transactions le fichier portait, combien ont été rapprochées et
 * enregistrées, combien l'étaient déjà (doublon ignoré), et lesquelles sont
 * introuvables — nommées par leur `EndToEndId`, leur RUM et leur montant pour
 * que l'équipe les cherche. Ce que le serveur a fait, relu ; rien n'est décidé
 * ici.
 */
@Component({
  selector: 'app-import-returns-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldDataTableCellDirective, FoldDataTableComponent],
  templateUrl: './import-returns-report.html',
  styleUrl: './import-returns-report.scss',
})
export class ImportReturnsReport {
  readonly report = input.required<CollectionReturnImportReportView>();

  protected readonly notFoundColumns = NOT_FOUND_COLUMNS;
  protected readonly setAsideColumns = SET_ASIDE_COLUMNS;
  protected readonly rowKey = (row: ImportReportEntryView): string =>
    `${row.endToEndId}-${row.returnedOn}`;

  protected readonly figures = computed((): readonly ReportFigure[] => {
    const report = this.report();
    return [
      { key: 'read', count: report.readCount, label: 'lues dans le fichier' },
      { key: 'recorded', count: report.recordedCount, label: 'rapprochées et enregistrées' },
      {
        key: 'already',
        count: report.alreadyRecordedCount,
        label: 'déjà enregistrées (doublon ignoré)',
      },
      { key: 'not-found', count: report.notFound.length, label: 'introuvables' },
      { key: 'set-aside', count: report.setAside.length, label: 'écartées' },
    ];
  });

  protected rumOf(row: ImportReportEntryView): string {
    return row.mandateReference ?? '—';
  }

  protected amountOf(row: ImportReportEntryView): string {
    return euros(row.amountCents);
  }

  protected dayOf(row: ImportReportEntryView): string {
    return day(row.returnedOn);
  }

  protected problemOf(row: SetAsideImportReportEntryView): string {
    return row.problem;
  }
}
