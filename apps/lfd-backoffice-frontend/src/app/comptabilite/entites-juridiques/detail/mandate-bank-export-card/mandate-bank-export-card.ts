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
  LegalEntityView,
  MandateBankExportSummaryView,
  MandateBankExportsView,
  MandateBankRowView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInlineConfirmComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
  type FoldTableColumn,
  type FoldTableTone,
} from 'fold-ng';

import { blobRefusalMessage } from '../../../../shared/download/blob-refusal';
import { saveBlob } from '../../../../shared/download/save-blob';
import { exportPartSentence } from '../../../bank-export-part-wording';

const MANDATE_NOUN = ['mandat', 'mandats'] as const;
import { BANK_REPORT_PENDING_HINT } from '../../../account-bank-export-wording';
import {
  BankRejectionPanel,
  type BankRejectionPanelData,
} from '../../../bank-rejection-panel/bank-rejection-panel';
import {
  mandateReportOf,
  mandatesLabel,
  mandateStandingLabel,
} from '../../../mandate-bank-export-wording';
import { MandateBankExportsService } from '../../../mandate-bank-exports.service';

/** Ce que la banque importe au plus par fichier (réponse 12) — le serveur coupe au-delà. */
const MAX_PER_EXPORT = 200;

/**
 * **Mandats à la banque** — télécharger, déposer ou abandonner le fichier
 * d'import des mandats du portail de la banque, et reporter son compte rendu
 * (plan `export-des-mandats-pour-la-banque.md`, doc
 * `prerequis-export-mandats.md`). Alignée sur la carte des comptes le
 * 2026-10-23 (Hugo).
 *
 * ## Un seul bouton pour le fichier
 *
 * « Télécharger » prépare l'export S'IL N'Y EN A PAS d'ouvert, puis tire son
 * fichier ; l'écran enchaîne les deux appels. Un échec du téléchargement
 * laisse un export ouvert, que le même bouton re-télécharge — jamais un
 * second. « J'ai déposé le fichier dans CENET » s'ouvre une fois le fichier
 * tiré ; le serveur le refuse avant.
 *
 * ## Le compte rendu, ligne par ligne
 *
 * Après le dépôt, chaque mandat de l'export reçoit « signalé comme connu par
 * la banque » ou « rejeté par la banque » (motif saisi, le mandat repart).
 * Avant, les deux gestes sont visibles mais grisés.
 */
@Component({
  selector: 'app-mandate-bank-export-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInlineConfirmComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './mandate-bank-export-card.html',
  styleUrl: './mandate-bank-export-card.scss',
})
export class MandateBankExportCard {
  private readonly service = inject(MandateBankExportsService);
  private readonly panels = inject(FoldPanelHostService);

  readonly entity = input.required<LegalEntityView>();

  /**
   * Après chaque geste, réussi ou refusé, une fois la carte relue : l'hôte
   * qui calcule un état à partir des mandats (la page « Procédure de
   * prélèvement ») le relit. La fiche de l'entité ne l'écoute pas.
   */
  readonly changed = output();

  protected readonly view = signal<MandateBankExportsView | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly mandates = mandatesLabel;
  protected readonly pendingHint = BANK_REPORT_PENDING_HINT;
  protected readonly reportOf = (row: MandateBankRowView): ReturnType<typeof mandateReportOf> =>
    mandateReportOf(row.standing);
  protected readonly standingOf = (row: MandateBankRowView): string =>
    mandateStandingLabel(row.standing);
  protected readonly rowKey = (row: MandateBankRowView): string => row.mandateId;
  protected readonly toneOf = (row: MandateBankRowView): FoldTableTone =>
    row.standing.kind === 'excluded' ? 'warning' : null;
  protected readonly columns: readonly FoldTableColumn<MandateBankRowView>[] = [
    { key: 'mandate', label: 'Débiteur (RUM)' },
    { key: 'iban', label: 'IBAN' },
    { key: 'standing', label: 'État' },
    { key: 'actions', label: 'Actions', align: 'right' },
  ];

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

  /** Les exports ni importés ni abandonnés, le plus ancien d'abord. */
  protected openExports(view: MandateBankExportsView): readonly MandateBankExportSummaryView[] {
    return view.exports
      .filter((item) => item.importedAt === null && item.abandonedAt === null)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  /**
   * Ce que le prochain fichier portera : les lignes « à exporter », plafonnées.
   * Pas d'option « tous » (retirée le 2026-10-23) : la banque rejette l'import
   * entier dès qu'un mandat lui est déjà connu (réponse 12).
   */
  protected nextExportSize(view: MandateBankExportsView): number {
    return Math.min(view.toExportCount, MAX_PER_EXPORT);
  }

  protected downloadLabel(item: MandateBankExportSummaryView): string {
    return item.lastDownloadedAt === null
      ? `Télécharger le fichier des mandats (${mandatesLabel(item.mandateCount)})`
      : 'Télécharger à nouveau le fichier';
  }

  protected otherOpenLabel(count: number): string {
    return count === 1 ? '1 autre export ouvert' : `${String(count)} autres exports ouverts`;
  }

  protected maskedIban(row: MandateBankRowView): string {
    return row.ibanLast4 === null ? '—' : `•••• ${row.ibanLast4}`;
  }

  /**
   * « EXM-4 · Fichier 1 sur 2 — 200 mandats. Les 12 suivants… » — « à
   * exporter » ne compte plus les mandats en vol (2026-10-23), comme les comptes.
   */
  protected partSentence(view: MandateBankExportsView, item: MandateBankExportSummaryView): string {
    return exportPartSentence(item, item.mandateCount, view.toExportCount, MANDATE_NOUN);
  }

  protected async prepare(): Promise<void> {
    const entityId = this.entity().id;
    await this.run(async () => {
      const exportId = await this.service.prepare(entityId);
      await this.download(exportId);
    });
  }

  protected async downloadFile(item: MandateBankExportSummaryView): Promise<void> {
    await this.run(() => this.download(item.id));
  }

  protected async markImported(item: MandateBankExportSummaryView): Promise<void> {
    const entityId = this.entity().id;
    await this.run(() => this.service.markImported(entityId, item.id));
  }

  protected async abandon(item: MandateBankExportSummaryView): Promise<void> {
    const entityId = this.entity().id;
    await this.run(() => this.service.abandon(entityId, item.id));
  }

  protected async reportKnown(row: MandateBankRowView): Promise<void> {
    const report = mandateReportOf(row.standing);
    if (report?.state !== 'open') {
      return;
    }
    const entityId = this.entity().id;
    await this.run(() => this.service.reportKnown(entityId, report.exportId, row.mandateId));
  }

  /** Le motif se saisit dans un panneau ; fermé sans motif, rien ne part. */
  protected async reject(row: MandateBankRowView): Promise<void> {
    const report = mandateReportOf(row.standing);
    if (report?.state !== 'open') {
      return;
    }
    const reason = await this.panels.open<BankRejectionPanelData, string>(BankRejectionPanel, {
      data: { subject: `${row.debtorName} — ${row.reference}` },
      width: 'md',
    }).closed;
    if (reason === undefined) {
      return;
    }
    const entityId = this.entity().id;
    await this.run(() => this.service.reject(entityId, report.exportId, row.mandateId, reason));
  }

  /** Le nom vient du serveur, figé par export ; le repli ne sert que s'il manque. */
  private async download(exportId: string): Promise<void> {
    const file = await this.service.file(this.entity().id, exportId);
    saveBlob(file.blob, file.fileName ?? 'mandats-banque.csv');
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
