import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  COLLECTION_TEST_STATUS_LABELS,
  type CollectionTestDebtorsView,
  type CollectionTestStatusView,
  type CollectionTestView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { saveBlob } from '../../shared/download/save-blob';
import { CollectionTestsService } from '../collection-tests.service';
import { day, euros, instant } from '../invoice-dossier-format';
import {
  GenerateTestPanel,
  eligibleDebtors,
  type GenerateTestPanelData,
} from './generate-test-panel/generate-test-panel';
import { RefundTestPanel, type RefundTestPanelData } from './refund-test-panel/refund-test-panel';

/** Les trois fichiers d'une ligne, dans l'ordre des boutons. */
type RowFile = 'rib' | 'mandate' | 'debit';

type BadgeVariant = 'success' | 'alert' | 'warning' | 'neutral';

const STATUS_VARIANTS: Readonly<Record<CollectionTestStatusView, BadgeVariant>> = {
  awaiting_due_date: 'neutral',
  to_refund: 'warning',
  returned: 'neutral',
  refunded: 'success',
  refunded_and_returned: 'alert',
};

const BASE_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'debtor', label: 'Établissement' },
  { key: 'file', label: 'Fichier' },
  { key: 'amount', label: 'Montant', numeric: true },
  { key: 'due', label: 'Échéance' },
  { key: 'status', label: 'État' },
];

/**
 * **Comptabilité › Prélèvement d'essai** (plan
 * `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`) —
 * générer un `pain.008` d'un débit sur un de nos établissements, le
 * télécharger, et suivre les essais : « à rembourser » si la banque a pu
 * prélever (Q4), rejet ou retour rattaché, « Marqué remboursé ».
 *
 * Un essai n'est pas un lot : il ne touche ni facture, ni bon, ni lot, ni état
 * d'encaissement, et l'outil ne le dépose pas.
 */
@Component({
  selector: 'app-prelevement-d-essai-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldPageLayoutComponent,
    RouterLink,
  ],
  templateUrl: './prelevement-d-essai-page.html',
  styleUrl: './prelevement-d-essai-page.scss',
})
export class PrelevementDEssaiPage {
  private readonly api = inject(CollectionTestsService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly tool = signal<CollectionTestDebtorsView | null>(null);
  protected readonly tests = signal<readonly CollectionTestView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly pending = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('collection_test:write'));
  protected readonly columns = computed<readonly FoldTableColumn[]>(() =>
    this.canWrite() ? [...BASE_COLUMNS, { key: 'actions', label: '' }] : BASE_COLUMNS,
  );
  protected readonly refused = computed(
    () => this.tool()?.debtors.filter((debtor) => debtor.refusal !== null) ?? [],
  );
  protected readonly canGenerate = computed(() => {
    const tool = this.tool();
    return this.canWrite() && tool !== null && eligibleDebtors(tool).length > 0;
  });
  protected readonly noEstablishment = computed(
    () => !this.loading() && (this.tool()?.debtors.length ?? 0) === 0,
  );
  protected readonly rowKey = (row: CollectionTestView): string => row.id;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [tool, list] = await Promise.all([this.api.debtors(), this.api.list()]);
      this.tool.set(tool);
      this.tests.set(list.tests);
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les essais sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected statusLabel(row: CollectionTestView): string {
    return COLLECTION_TEST_STATUS_LABELS[row.status];
  }

  protected statusVariant(row: CollectionTestView): BadgeVariant {
    return STATUS_VARIANTS[row.status];
  }

  protected amountOf(row: CollectionTestView): string {
    return euros(row.amountCents);
  }

  protected dueOf(row: CollectionTestView): string {
    return day(row.requestedCollectionDay);
  }

  protected createdOf(row: CollectionTestView): string {
    const by = row.createdByName === null ? '' : ` par ${row.createdByName}`;
    return `${instant(row.createdAt)}${by}`;
  }

  /** Ce qui suit l'état : le retour de la banque, ou le remboursement. */
  protected detailOf(row: CollectionTestView): string {
    if (row.bankReturn !== null) {
      return `${row.bankReturn.reasonCode} — ${row.bankReturn.reason}, le ${day(row.bankReturn.returnedOn)}`;
    }
    if (row.refundedOn !== null) {
      const by = row.refundedByName === null ? '' : ` par ${row.refundedByName}`;
      return `Remboursé le ${day(row.refundedOn)}${by}`;
    }
    return '';
  }

  protected async generate(): Promise<void> {
    const tool = this.tool();
    if (tool === null) {
      return;
    }
    const testId = await this.panels.open<GenerateTestPanelData, string>(GenerateTestPanel, {
      data: { tool },
      width: 'md',
    }).closed;
    if (testId === undefined) {
      return;
    }
    this.notify.success('Fichier d’essai généré.');
    await this.download(testId, `ESSAI-prelevement-ESS-${testId}.xml`);
    await this.reload();
  }

  protected isPending(row: CollectionTestView, file: RowFile): boolean {
    return this.pending() === `${row.id}:${file}`;
  }

  /** Le compte de l'établissement, au format des comptes destinataires de la banque. */
  protected async downloadRib(row: CollectionTestView): Promise<void> {
    await this.save(
      `${row.id}:rib`,
      () => this.api.bankAccountFile(row.debtorCompanyId),
      `ESSAI-rib-banque-${row.mandateReference}.csv`,
      'Le RIB n’a pas pu être exporté.',
    );
  }

  /** Le mandat de l'établissement, au format d'import des mandats de la banque. */
  protected async downloadMandate(row: CollectionTestView): Promise<void> {
    await this.save(
      `${row.id}:mandate`,
      () => this.api.mandateFile(row.debtorCompanyId),
      `ESSAI-mandat-banque-${row.mandateReference}.csv`,
      'Le mandat n’a pas pu être exporté.',
    );
  }

  /** Le `pain.008` gardé de l'essai. */
  protected async downloadRow(row: CollectionTestView): Promise<void> {
    await this.download(row.id, `ESSAI-prelevement-${row.messageId}.xml`);
  }

  protected async refund(row: CollectionTestView): Promise<void> {
    const done = await this.panels.open<RefundTestPanelData, boolean>(RefundTestPanel, {
      data: { test: row },
      width: 'md',
    }).closed;
    if (done !== true) {
      return;
    }
    this.notify.success(`Essai sur ${row.debtorName} marqué remboursé.`);
    await this.reload();
  }

  private async download(testId: string, fileName: string): Promise<void> {
    await this.save(
      `${testId}:debit`,
      () => this.api.file(testId),
      fileName,
      'Le fichier n’a pas pu être téléchargé.',
    );
  }

  private async save(
    key: string,
    read: () => Promise<Blob>,
    fileName: string,
    fallback: string,
  ): Promise<void> {
    this.pending.set(key);
    this.actionError.set(null);
    try {
      saveBlob(await read(), fileName);
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, fallback));
    } finally {
      this.pending.set(null);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.tests.set((await this.api.list()).tests);
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, 'La liste n’a pas pu être relue.'));
    }
  }
}
