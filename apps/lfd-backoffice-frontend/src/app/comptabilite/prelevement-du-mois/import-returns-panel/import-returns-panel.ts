import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type {
  CollectionReturnImportPreviewView,
  ImportedReturnStatusView,
  ImportedReturnView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldFileDropzoneComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldTableColumn,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { CollectionReturnsService } from '../../collection-returns.service';
import { day, euros } from '../../invoice-dossier-format';

const COLUMNS: readonly FoldTableColumn[] = [
  { key: 'status', label: 'Appariement' },
  { key: 'debtor', label: 'Débiteur' },
  { key: 'reason', label: 'Motif' },
  { key: 'amount', label: 'Montant', numeric: true },
];

const STATUS: Readonly<
  Record<
    ImportedReturnStatusView,
    { variant: 'success' | 'alert' | 'warning' | 'neutral'; label: string }
  >
> = {
  matched: { variant: 'success', label: 'Apparié' },
  unknown: { variant: 'neutral', label: 'Inconnu' },
  amount_mismatch: { variant: 'warning', label: 'Montant différent' },
  already_returned: { variant: 'neutral', label: 'Déjà enregistré' },
  not_returnable: { variant: 'alert', label: 'Refusé' },
};

/**
 * **Importer un fichier de la banque** (plan `retours-bancaires.md`) : un `pain.002` ou un `camt.054`. L'aperçu dit ce que chaque
 * transaction deviendrait ; seules les appariées s'enregistrent, et seulement
 * quand le staff confirme. Le serveur relit le fichier à la confirmation.
 */
@Component({
  selector: 'app-import-returns-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldFileDropzoneComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './import-returns-panel.html',
  styleUrl: './import-returns-panel.scss',
})
export class ImportReturnsPanel {
  private readonly api = inject(CollectionReturnsService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  /** Aucune donnée : le panneau part d'un fichier qu'on lui dépose. */
  readonly data = input<undefined>(undefined);

  protected readonly columns = COLUMNS;
  protected readonly rowKey = (row: ImportedReturnView): string => row.endToEndId;

  protected readonly file = signal<File | null>(null);
  protected readonly preview = signal<CollectionReturnImportPreviewView | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly matched = computed(() =>
    (this.preview()?.entries ?? []).filter((entry) => entry.status === 'matched'),
  );

  protected async picked(files: readonly File[]): Promise<void> {
    const [file] = files;
    if (file === undefined) {
      return;
    }
    this.file.set(file);
    this.preview.set(null);
    await this.run(
      async () => this.preview.set(await this.api.previewImport(file)),
      'Le fichier n’a pas pu être lu.',
    );
  }

  protected async confirm(): Promise<void> {
    const file = this.file();
    const ids = this.matched().map((entry) => entry.endToEndId);
    if (file === null || ids.length === 0) {
      return;
    }
    await this.run(async () => {
      await this.api.confirmImport(file, ids);
      this.ref.close(true);
    }, 'Les retours n’ont pas pu être enregistrés.');
  }

  protected statusOf(row: ImportedReturnView): (typeof STATUS)[ImportedReturnStatusView] {
    return STATUS[row.status];
  }

  protected amountOf(row: ImportedReturnView): string {
    const line = row.lineAmountCents;
    return line === null || line === row.amountCents
      ? euros(row.amountCents)
      : `${euros(row.amountCents)} (ligne : ${euros(line)})`;
  }

  protected dayOf(row: ImportedReturnView): string {
    return day(row.returnedOn);
  }

  protected close(): void {
    this.ref.close();
  }

  private async run(work: () => Promise<void>, fallback: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await work();
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, fallback));
    } finally {
      this.busy.set(false);
    }
  }
}
