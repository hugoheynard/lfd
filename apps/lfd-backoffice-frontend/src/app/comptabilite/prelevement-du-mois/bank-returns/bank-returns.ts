import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type {
  BatchCollectionReturnsView,
  CollectionBatchLineView,
  CollectionBatchView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { batchMonthName, ofMonth } from '../../collection-month-wording';
import { CollectionReturnsService } from '../../collection-returns.service';
import { euros } from '../../invoice-dossier-format';
import { ImportReturnsPanel } from '../import-returns-panel/import-returns-panel';
import {
  ResolveReturnPanel,
  type ResolveReturnPanelData,
} from '../resolve-return-panel/resolve-return-panel';
import { ReturnPanel, type ReturnPanelData } from '../return-panel/return-panel';
import { ReturnRows, type ReturnGestureEvent } from '../return-rows/return-rows';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'rank', label: 'Ligne', numeric: true },
  { key: 'debtor', label: 'Débiteur' },
  { key: 'amount', label: 'Prélevé', numeric: true },
  { key: 'action', label: 'Retour' },
];

/**
 * **Les retours de la banque** (plan `plan-retours-bancaires.md`, R5a, R5b)
 * sur les lots DÉPOSÉS : les lignes du lot choisi, « Signaler un retour » sur
 * celles qui n'en ont pas, la liste des retours et leurs gestes, et l'import
 * d'un fichier de la banque. Un seul lot lu à la fois : l'écran ne multiplie
 * pas les appels par le nombre de lots passés.
 */
@Component({
  selector: 'app-bank-returns',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldPageSectionComponent,
    ReturnRows,
  ],
  templateUrl: './bank-returns.html',
  styleUrl: './bank-returns.scss',
})
export class BankReturns {
  private readonly api = inject(CollectionReturnsService);
  private readonly panels = inject(FoldPanelHostService);

  /** Les lots déposés, le plus récent d'abord. */
  readonly batches = input.required<readonly CollectionBatchView[]>();
  readonly canWrite = input(false);

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: CollectionBatchLineView): string => String(row.rank);

  protected readonly chosenId = signal<string | null>(null);
  protected readonly view = signal<BatchCollectionReturnsView | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly pendingId = signal<string | null>(null);

  protected readonly batch = computed(() => {
    const all = this.batches();
    return all.find((batch) => batch.id === this.chosenId()) ?? all[0] ?? null;
  });

  protected readonly options = computed(() =>
    this.batches().map((batch) => ({
      value: batch.id,
      label: `Lot ${ofMonth(batchMonthName(batch.cycleClosesAt))} — ${batch.scheme}`,
    })),
  );

  /** Les rangs qui ont déjà leur retour : la ligne ne se signale plus. */
  private readonly returnedRanks = computed(
    () => new Set((this.view()?.returns ?? []).map((item) => item.lineRank)),
  );

  constructor() {
    effect(() => {
      const batch = this.batch();
      if (batch !== null) {
        void this.load(batch.id);
      }
    });
  }

  protected hasReturn(line: CollectionBatchLineView): boolean {
    return this.returnedRanks().has(line.rank);
  }

  protected amountOf(line: CollectionBatchLineView): string {
    return euros(line.amountCents);
  }

  protected async signalReturn(line: CollectionBatchLineView): Promise<void> {
    const batch = this.batch();
    if (batch === null) {
      return;
    }
    const data: ReturnPanelData = {
      batchId: batch.id,
      rank: line.rank,
      debtorName: line.debtorName,
      amountCents: line.amountCents,
      scheme: batch.scheme,
      reasons: this.view()?.reasons ?? [],
    };
    await this.afterPanel(
      this.panels.open<ReturnPanelData, boolean>(ReturnPanel, { data, width: 'md' }).closed,
    );
  }

  protected async importFile(): Promise<void> {
    await this.afterPanel(
      this.panels.open<undefined, boolean>(ImportReturnsPanel, { data: undefined, width: 'lg' })
        .closed,
    );
  }

  protected async onGesture({ item, gesture }: ReturnGestureEvent): Promise<void> {
    if (gesture !== 'represent') {
      const data: ResolveReturnPanelData = { item, gesture };
      await this.afterPanel(
        this.panels.open<ResolveReturnPanelData, boolean>(ResolveReturnPanel, { data, width: 'md' })
          .closed,
      );
      return;
    }
    this.pendingId.set(item.id);
    this.error.set(null);
    try {
      await this.api.represent(item.id);
      await this.load(item.batchId);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Le retour n’a pas pu être re-présenté.'));
    } finally {
      this.pendingId.set(null);
    }
  }

  private async afterPanel(closed: Promise<boolean | undefined>): Promise<void> {
    const batch = this.batch();
    if ((await closed) === true && batch !== null) {
      await this.load(batch.id);
    }
  }

  private async load(batchId: string): Promise<void> {
    try {
      this.view.set(await this.api.ofBatch(batchId));
      this.error.set(null);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Les retours du lot n’ont pas pu être lus.'));
    }
  }
}
