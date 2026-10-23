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
  FoldLoadingStateComponent,
  FoldInlineConfirmComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import { blobRefusalMessage } from '../../../../shared/download/blob-refusal';
import { saveBlob } from '../../../../shared/download/save-blob';
import { exportPartSentence } from '../../../bank-export-part-wording';

const ACCOUNT_NOUN = ['compte', 'comptes'] as const;
import {
  accountsLabel,
  accountStandingLabel,
  BANK_REPORT_PENDING_HINT,
  KNOWN_REASON_GESTURES,
  knownGestureOf,
  reportGesturesOf,
  type BankReportGestures,
} from '../../../account-bank-export-wording';
import {
  BankRejectionPanel,
  type BankRejectionPanelData,
} from '../../../bank-rejection-panel/bank-rejection-panel';
import { accountBankNames } from './account-bank-names';
import {
  FILTER_LABELS,
  filterOf,
  type AccountBankFigure,
  type AccountBankFilter,
} from './account-bank-filter';
import { AccountBankExportsService } from '../../../account-bank-exports.service';
import { parisDayLabel } from '../../../mandate-bank-export-wording';

/**
 * **Comptes à la banque** — préparer, télécharger, marquer importé ou
 * abandonner le fichier des comptes destinataires du portail de la banque, et
 * déclarer un compte « déjà connu » (doc `prerequis-export-ribs.md`).
 *
 * ## Pourquoi « nouveaux seulement » se voit
 *
 * Un seul compte que la banque connaît déjà fait rejeter TOUT l'import
 * (réponse 8). Le tableau montre donc chaque compte débité et où il en est.
 * Un compte à exporter se dit « importé dans CENET directement » (saisi à la
 * main). Une fois le fichier DÉPOSÉ, chaque compte de l'export reçoit le
 * compte rendu d'import CENET : « signalé comme connu par la banque » ou
 * « rejeté par la banque » (motif saisi, le compte repart) — avant le dépôt,
 * ces deux gestes sont visibles mais grisés (Hugo, 2026-10-23).
 *
 * ## Un seul bouton pour le fichier
 *
 * « Télécharger » prépare l'export S'IL N'Y EN A PAS d'ouvert, puis tire son
 * fichier ; l'écran enchaîne les deux appels. Préparer est une écriture
 * (`POST`), le fichier une lecture journalisée (`GET`) : les garder séparés
 * laisse, si le téléchargement échoue, un export ouvert que le même bouton
 * re-télécharge — jamais un export perdu ni un second créé. Un fichier
 * téléchargé n'est pas un fichier déposé : « J'ai déposé le fichier dans
 * CENET » reste un geste à part.
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
    FoldLoadingStateComponent,
    FoldInlineConfirmComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './account-bank-export-card.html',
  styleUrl: './account-bank-export-card.scss',
})
export class AccountBankExportCard {
  private readonly service = inject(AccountBankExportsService);
  private readonly panels = inject(FoldPanelHostService);

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
  protected readonly pendingHint = BANK_REPORT_PENDING_HINT;
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

  /**
   * Les exports ni importés ni abandonnés, le plus ancien d'abord : la barre
   * d'actions traite le premier et ne fait que compter les autres.
   */
  protected openExports(view: AccountBankExportsView): readonly AccountBankExportSummaryView[] {
    return view.exports
      .filter((item) => item.importedAt === null && item.abandonedAt === null)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  /** Ce que le prochain fichier portera : la file, bornée par fichier. */
  protected nextExportSize(view: AccountBankExportsView): number {
    return Math.min(view.toExport.length, view.maxPerExport);
  }

  /** « EXC-12 · Fichier 1 sur 2 — 200 comptes. Les 37 suivants… » */
  protected partSentence(view: AccountBankExportsView, item: AccountBankExportSummaryView): string {
    return exportPartSentence(item, item.accountCount, view.toExport.length, ACCOUNT_NOUN);
  }

  protected otherOpenLabel(count: number): string {
    return count === 1 ? '1 autre export ouvert' : `${count} autres exports ouverts`;
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

  protected gestureOf(row: AccountBankRowView): KnownBankAccountReasonView | null {
    return knownGestureOf(row.standing);
  }

  /** Les gestes du compte rendu CENET : grisés avant le dépôt, ouverts après. */
  protected reportOf(row: AccountBankRowView): BankReportGestures {
    return reportGesturesOf(row.standing);
  }

  /**
   * Le bouton unique de la barre : un export ouvert jamais téléchargé se
   * télécharge (un échec après la préparation en laisse un) ; déjà
   * téléchargé, il se télécharge à nouveau — le même export, jamais un neuf.
   */
  protected downloadLabel(item: AccountBankExportSummaryView): string {
    return item.lastDownloadedAt === null
      ? `Télécharger le fichier des comptes (${accountsLabel(item.accountCount)})`
      : 'Télécharger à nouveau le fichier';
  }

  protected async reportKnown(row: AccountBankRowView): Promise<void> {
    const exportId = row.standing.kind === 'imported' ? row.standing.exportId : null;
    if (exportId === null) {
      return;
    }
    const entityId = this.entity().id;
    await this.run(() => this.service.reportKnown(entityId, exportId, row.bankAccountId));
  }

  /** Le motif se saisit dans un panneau ; fermé sans motif, rien ne part. */
  protected async reject(row: AccountBankRowView): Promise<void> {
    const exportId = row.standing.kind === 'imported' ? row.standing.exportId : null;
    if (exportId === null) {
      return;
    }
    const reason = await this.panels.open<BankRejectionPanelData, string>(BankRejectionPanel, {
      data: { subject: `${accountBankNames(row).headline} — ${this.maskedIban(row)}` },
      width: 'md',
    }).closed;
    if (reason === undefined) {
      return;
    }
    const entityId = this.entity().id;
    await this.run(() => this.service.reject(entityId, exportId, row.bankAccountId, reason));
  }

  protected async declareKnown(
    row: AccountBankRowView,
    reason: KnownBankAccountReasonView,
  ): Promise<void> {
    const entityId = this.entity().id;
    await this.run(() => this.service.declareKnown(entityId, row.bankAccountId, reason));
  }

  /** Le nom vient du serveur, figé par export ; le repli ne sert que s'il manque. */
  private async download(exportId: string): Promise<void> {
    const file = await this.service.file(this.entity().id, exportId);
    saveBlob(file.blob, file.fileName ?? 'comptes-banque.csv');
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
