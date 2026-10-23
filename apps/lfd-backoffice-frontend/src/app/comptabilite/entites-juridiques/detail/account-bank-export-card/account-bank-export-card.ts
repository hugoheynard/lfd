import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type {
  AccountBankExportSummaryView,
  AccountBankExportsView,
  AccountBankRowView,
  KnownBankAccountReasonView,
  LegalEntityView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldPageSectionComponent,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import { blobRefusalMessage } from '../../../../shared/download/blob-refusal';
import { saveBlob } from '../../../../shared/download/save-blob';
import {
  accountExportStateLabel,
  accountsLabel,
  accountStandingLabel,
  KNOWN_REASON_GESTURES,
} from '../../../account-bank-export-wording';
import { accountBankNames } from './account-bank-names';
import { AccountBankExportsService } from '../../../account-bank-exports.service';
import { parisDayLabel } from '../../../mandate-bank-export-wording';

/** Ce que filtre un chiffre clé : « connus » réunit importés et déclarés. */
type AccountBankFilter = 'to_export' | 'in_flight' | 'known';

interface AccountBankFigure {
  readonly filter: AccountBankFilter;
  readonly count: number;
  readonly label: string;
}

const FILTER_LABELS: Readonly<Record<AccountBankFilter, string>> = {
  to_export: 'à exporter',
  in_flight: 'en attente de la banque',
  known: 'connus de la banque',
};

function filterOf(row: AccountBankRowView): AccountBankFilter | null {
  switch (row.standing.kind) {
    case 'to_export':
    case 'in_flight':
      return row.standing.kind;
    case 'imported':
    case 'declared':
      return 'known';
    case 'excluded':
      return null;
  }
}

/**
 * **Comptes à la banque** — préparer, télécharger, marquer importé ou
 * abandonner le fichier des comptes destinataires du portail de la banque, et
 * déclarer un compte « déjà connu » (doc `prerequis-export-ribs.md`).
 *
 * ## Pourquoi « nouveaux seulement » se voit
 *
 * Un seul compte que la banque connaît déjà fait rejeter TOUT l'import
 * (réponse 8). Le tableau montre donc chaque compte débité et où il en est,
 * et propose deux gestes sur chaque compte à exporter : « importé dans CENET
 * directement » (saisi à la main) et « signalé comme connu par la banque »
 * (le compte rendu d'import le dit). Les deux le retirent du fichier ; la
 * raison reste écrite, sur la ligne et au journal.
 *
 * Un fichier téléchargé n'est pas un fichier importé : la carte ne déduit
 * rien d'un clic sur « Télécharger ».
 */
@Component({
  selector: 'app-account-bank-export-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './account-bank-export-card.html',
  styleUrl: './account-bank-export-card.scss',
})
export class AccountBankExportCard {
  private readonly service = inject(AccountBankExportsService);

  readonly entity = input.required<LegalEntityView>();

  /**
   * Après chaque geste, réussi ou refusé, une fois la carte relue : l'hôte
   * qui calcule un état à partir des comptes (la page « Procédure de
   * prélèvement ») le relit. La fiche de l'entité ne l'écoute pas.
   */
  readonly changed = output();

  protected readonly view = signal<AccountBankExportsView | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly filter = signal<AccountBankFilter | null>(null);
  protected readonly filterLabels = FILTER_LABELS;
  protected readonly namesOf = accountBankNames;

  protected readonly gestures = KNOWN_REASON_GESTURES;
  /** L'ordre des deux gestes sur la ligne : le plus courant d'abord. */
  protected readonly reasons: readonly KnownBankAccountReasonView[] = [
    'entered_in_cenet',
    'reported_by_bank',
  ];
  protected readonly standingOf = (row: AccountBankRowView): string =>
    accountStandingLabel(row.standing);
  protected readonly rowKey = (row: AccountBankRowView): string => row.bankAccountId;
  protected readonly toneOf = (row: AccountBankRowView): FoldTableTone =>
    row.standing.kind === 'excluded' ? 'warning' : null;
  protected readonly columns: readonly FoldTableColumn<AccountBankRowView>[] = [
    { key: 'company', label: 'Société (titulaire)' },
    { key: 'iban', label: 'IBAN' },
    { key: 'bic', label: 'BIC' },
    { key: 'standing', label: 'État' },
    { key: 'actions', label: 'Actions', align: 'right' },
  ];
  protected readonly accounts = accountsLabel;
  protected readonly day = parisDayLabel;
  protected readonly stateOf = accountExportStateLabel;

  constructor() {
    effect(() => {
      void this.load(this.entity().id);
    });
  }

  protected async load(entityId = this.entity().id): Promise<void> {
    try {
      this.view.set(await this.service.of(entityId));
      this.loadError.set(null);
    } catch (error: unknown) {
      this.loadError.set(httpErrorMessage(error));
    }
  }

  protected figures(view: AccountBankExportsView): readonly AccountBankFigure[] {
    return [
      { filter: 'to_export', count: view.toExport.length, label: FILTER_LABELS.to_export },
      { filter: 'in_flight', count: view.inFlightCount, label: FILTER_LABELS.in_flight },
      { filter: 'known', count: view.knownCount, label: FILTER_LABELS.known },
    ];
  }

  /** Un clic filtre ; le même clic sur le chiffre actif rend tout le tableau. */
  protected toggle(filter: AccountBankFilter): void {
    this.filter.update((active) => (active === filter ? null : filter));
  }

  protected shown(view: AccountBankExportsView): readonly AccountBankRowView[] {
    const active = this.filter();
    return active === null
      ? view.accounts
      : view.accounts.filter((row) => filterOf(row) === active);
  }

  /** Les comptes qui attendront l'export d'après (200 au plus par fichier). */
  protected leftOver(view: AccountBankExportsView): number {
    return Math.max(0, view.toExport.length - view.maxPerExport);
  }

  /** Les exports ni importés ni abandonnés : leurs deux gestes passent au-dessus du tableau. */
  protected openExports(view: AccountBankExportsView): readonly AccountBankExportSummaryView[] {
    return view.exports.filter((item) => this.isOpen(item));
  }

  protected isOpen(item: AccountBankExportSummaryView): boolean {
    return item.importedAt === null && item.abandonedAt === null;
  }

  protected async prepare(): Promise<void> {
    const entityId = this.entity().id;
    await this.run(async () => {
      const exportId = await this.service.prepare(entityId);
      await this.download(exportId);
    });
  }

  protected async downloadFile(item: AccountBankExportSummaryView): Promise<void> {
    await this.run(() => this.download(item.id));
  }

  protected async markImported(item: AccountBankExportSummaryView): Promise<void> {
    const entityId = this.entity().id;
    await this.run(() => this.service.markImported(entityId, item.id));
  }

  protected async abandon(item: AccountBankExportSummaryView): Promise<void> {
    const entityId = this.entity().id;
    await this.run(() => this.service.abandon(entityId, item.id));
  }

  /** « FR •••• 0143 » — le pays et les quatre derniers, rien d'autre. */
  protected maskedIban(row: AccountBankRowView): string {
    return `${row.ibanCountry} •••• ${row.ibanLast4}`;
  }

  protected canDeclare(row: AccountBankRowView): boolean {
    return row.standing.kind === 'to_export';
  }

  protected async declareKnown(
    row: AccountBankRowView,
    reason: KnownBankAccountReasonView,
  ): Promise<void> {
    const entityId = this.entity().id;
    await this.run(() => this.service.declareKnown(entityId, row.bankAccountId, reason));
  }

  private async download(exportId: string): Promise<void> {
    const blob = await this.service.file(this.entity().id, exportId);
    saveBlob(blob, `comptes-banque-${this.entity().siren}-${exportId}.csv`);
  }

  /** Un geste, puis la carte relue — même après un refus, qui peut venir d'un état périmé. */
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
    } catch (error: unknown) {
      this.actionError.set(await blobRefusalMessage(error));
    } finally {
      await this.load();
      this.busy.set(false);
      this.changed.emit();
    }
  }
}
