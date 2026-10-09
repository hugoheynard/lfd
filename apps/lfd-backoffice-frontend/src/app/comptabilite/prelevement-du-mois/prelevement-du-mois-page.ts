import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  CollectionBatchView,
  CollectionCycleView,
  CollectionExclusionView,
  CollectionPreviewView,
  LegalEntityView,
  MonthlyInvoicesView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { saveBlob } from '../../shared/download/save-blob';
import { CollectionBatchesService } from '../collection-batches.service';
import {
  closedMonthKey,
  monthToPrepareKey,
  monthToPrepareName,
  ofMonth,
} from '../collection-month-wording';
import { LegalEntitiesService } from '../legal-entities.service';
import { day } from '../invoice-dossier-format';
import { MonthlyInvoicesService } from '../monthly-invoices.service';
import { BankReturns } from './bank-returns/bank-returns';
import { BatchHistory, type HistoryDownload } from './batch-history/batch-history';
import { ExcludedOrders } from './excluded-orders/excluded-orders';
import { CardInvoiceSignals } from './card-invoice-signals/card-invoice-signals';
import { MonthInvoices } from './month-invoices/month-invoices';
import { MonthPreview } from './month-preview/month-preview';
import { MonthSchedule } from './month-schedule/month-schedule';
import { PendingBatch, type PendingBatchGesture } from './pending-batch/pending-batch';
import { SettlePanel } from './settle-panel/settle-panel';

/**
 * **Comptabilité › Prélèvement du mois** (plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA4) — un seul
 * écran, qui se lit de haut en bas comme le mois :
 *
 * 1. le **calendrier** du mois et l'état de la préparation automatique ;
 * 2. le **mois en cours** : l'aperçu de ce qui sera prélevé, calculé comme le
 *    lot (une facture par payeur), et pourquoi il est vide ;
 * 3. les **factures du mois** (plan `facture-emise.md`) :
 *    émises le dernier jour à 23h55, les factures signalées, le bouton qui émet ;
 * 4. le **lot à traiter** : préparé, pas encore déposé — ses lignes, ses
 *    signalements, ses gestes ; et le bouton qui prépare le lot du mois clos,
 *    nommé par ce mois ;
 * 5. les **retours de la banque** sur les lots déposés (plan
 *    `retours-bancaires.md`) ;
 * 6. l'**historique** des lots, replié.
 *
 * Il remplace la page « Lots de prélèvement » et la carte « Prélèvement
 * SEPA » du tableau de bord, qui ne garde qu'un résumé.
 *
 * ## Deux échecs, deux portées
 *
 * Les entités et les lots sont la condition de l'écran : leur échec le rend
 * illisible. L'aperçu ne l'est pas — il recalcule tout le mois, et une panne
 * de sa part coûte sa carte, pas les gestes du lot à déposer. Les factures du
 * mois non plus : leur échec ne coûte que leur carte.
 */
@Component({
  selector: 'app-prelevement-du-mois-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BankReturns,
    BatchHistory,
    ExcludedOrders,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    MonthInvoices,
    CardInvoiceSignals,
    MonthPreview,
    MonthSchedule,
    PendingBatch,
  ],
  templateUrl: './prelevement-du-mois-page.html',
  styleUrl: './prelevement-du-mois-page.scss',
})
export class PrelevementDuMoisPage {
  private readonly api = inject(CollectionBatchesService);
  private readonly entitiesApi = inject(LegalEntitiesService);
  private readonly invoicesApi = inject(MonthlyInvoicesService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly entities = signal<readonly LegalEntityView[]>([]);
  protected readonly entityId = signal<string | null>(null);
  protected readonly view = signal<CollectionCycleView | null>(null);
  protected readonly preview = signal<CollectionPreviewView | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly invoices = signal<MonthlyInvoicesView | null>(null);
  protected readonly invoicesError = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly pending = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));

  protected readonly entity = computed(
    () => this.entities().find((entity) => entity.id === this.entityId()) ?? null,
  );

  protected readonly entityOptions = computed(() =>
    this.entities().map((entity) => ({ value: entity.id, label: entity.name })),
  );

  /** « septembre » : le mois clos dont on prépare le lot. */
  protected readonly monthToPrepare = computed(() => {
    const entity = this.entity();
    return entity === null ? '' : monthToPrepareName(entity.nextCollection.closesAt);
  });

  protected readonly prepareLabel = computed(
    () => `Préparer le lot ${ofMonth(this.monthToPrepare())}`,
  );

  /** Pourquoi il n'y a aucun lot à déposer — jamais un vide muet. */
  protected readonly nothingToProcess = computed(() => {
    const lot = `Le lot ${ofMonth(this.monthToPrepare())}`;
    return this.alreadyPrepared()
      ? `${lot} est déjà déposé ; le suivant se prépare après la fin du mois.`
      : `${lot} n’est pas encore préparé.`;
  });

  /** Préparés, pas encore déposés : ce qui demande un geste. */
  protected readonly toProcess = computed(() =>
    (this.view()?.batches ?? []).filter((batch) => batch.status === 'constituted'),
  );

  protected readonly history = computed(() =>
    (this.view()?.batches ?? []).filter((batch) => batch.status !== 'constituted'),
  );

  /** Les lots déposés, le plus récent d'abord — ceux qu'une banque peut renvoyer. */
  protected readonly deposited = computed(() =>
    [...this.history().filter((batch) => batch.status === 'deposited')].sort((a, b) =>
      b.cycleClosesAt.localeCompare(a.cycleClosesAt),
    ),
  );

  /**
   * Le lot du mois clos est-il déjà là (préparé ou déposé) ? Alors le bouton
   * n'a rien à préparer : il disparaît plutôt que d'attendre son refus.
   */
  protected readonly alreadyPrepared = computed(() => {
    const entity = this.entity();
    if (entity === null) {
      return false;
    }
    const month = monthToPrepareKey(entity.nextCollection.closesAt);
    return (this.view()?.batches ?? []).some(
      (batch) => batch.status !== 'cancelled' && closedMonthKey(batch.cycleClosesAt) === month,
    );
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const living = (await this.entitiesApi.list()).filter((entity) => entity.archivedAt === null);
      this.entities.set(living);
      const chosen = this.entityId() ?? living[0]?.id ?? null;
      this.entityId.set(chosen);
      if (chosen === null) {
        this.view.set(null);
        this.preview.set(null);
        this.invoices.set(null);
      } else {
        const [view] = await Promise.all([
          this.api.cycle(chosen),
          this.loadPreview(chosen),
          this.loadInvoices(chosen),
        ]);
        this.view.set(view);
      }
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Le prélèvement du mois est illisible.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** L'aperçu à part : son échec est PARTIEL, il ne coûte que sa carte. */
  private async loadPreview(entityId: string): Promise<void> {
    this.previewError.set(null);
    try {
      this.preview.set(await this.api.preview(entityId));
    } catch (caught) {
      this.preview.set(null);
      this.previewError.set(httpErrorMessage(caught, 'L’aperçu du mois est illisible.'));
    }
  }

  /** Les factures du mois à part : leur échec ne coûte que leur carte. */
  private async loadInvoices(entityId: string): Promise<void> {
    this.invoicesError.set(null);
    try {
      this.invoices.set(await this.invoicesApi.month(entityId));
    } catch (caught) {
      this.invoices.set(null);
      this.invoicesError.set(httpErrorMessage(caught, 'Les factures du mois sont illisibles.'));
    }
  }

  /** « Émettre les factures de … » — rejouable ; le compte rendu dit ce qui est parti. */
  protected async issueInvoices(month: string): Promise<void> {
    const entityId = this.entityId();
    if (entityId !== null) {
      await this.act('invoices', async () => {
        const report = await this.invoicesApi.issue({ legalEntityId: entityId, month });
        const late = report.issued.find((issued) => issued.issuedOn.slice(0, 7) > month);
        this.notify.success(
          (late === undefined ? '' : `Émise(s) en retard, le ${day(late.issuedOn)} — `) +
            `${String(report.issued.length)} facture(s) émise(s), ` +
            `${String(report.blocked.length)} facture(s) signalée(s)` +
            (report.alreadyInvoiced > 0
              ? `, ${String(report.alreadyInvoiced)} déjà émise(s) pour ce mois.`
              : '.'),
        );
      });
    }
  }

  protected async choose(entityId: string | null): Promise<void> {
    this.entityId.set(entityId);
    await this.load();
  }

  protected async prepare(): Promise<void> {
    const entityId = this.entityId();
    if (entityId !== null) {
      await this.act('prepare', async () => {
        const { batchIds } = await this.api.constitute(entityId);
        this.notify.success(
          batchIds.length === 0
            ? 'Aucun lot préparé : les bons écartés sont listés plus bas.'
            : `Lot ${ofMonth(this.monthToPrepare())} préparé.`,
        );
      });
    }
  }

  protected async onGesture(
    batch: CollectionBatchView,
    gesture: PendingBatchGesture,
  ): Promise<void> {
    if (gesture === 'xml' || gesture === 'csv') {
      await this.download({ batch, kind: gesture });
    } else if (gesture === 'deposit') {
      await this.act(batch.id, async () => {
        await this.api.deposit(batch.id);
        this.notify.success('Lot marqué déposé.');
      });
    } else {
      await this.act(batch.id, async () => {
        await this.api.cancel(batch.id);
        this.notify.success('Lot annulé : ses bons repassent à prélever.');
      });
    }
  }

  protected async download({ batch, kind }: HistoryDownload): Promise<void> {
    this.actionError.set(null);
    try {
      const file = kind === 'xml' ? await this.api.file(batch.id) : await this.api.audit(batch.id);
      saveBlob(file.blob, file.fileName ?? `lot-${batch.id}.${kind}`);
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, 'Téléchargement impossible.'));
    }
  }

  protected async settle(row: CollectionExclusionView): Promise<void> {
    const done = await this.panels.open<CollectionExclusionView, boolean>(SettlePanel, {
      data: row,
      width: 'md',
    }).closed;
    if (done === true) {
      await this.load();
    }
  }

  /** Un geste : son refus s'affiche avec les mots du serveur, puis on relit. */
  private async act(key: string, gesture: () => Promise<void>): Promise<void> {
    this.pending.set(key);
    this.actionError.set(null);
    try {
      await gesture();
      await this.load();
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, 'Le geste a été refusé.'));
    } finally {
      this.pending.set(null);
    }
  }
}
