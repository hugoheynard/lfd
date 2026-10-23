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
import { CollectionBatchGestures, type BatchDownload } from '../collection-batch-gestures';
import { CollectionBatchesService } from '../collection-batches.service';
import { isDeadBatch } from '../collection-batch-steps';
import { longDay, sameClosure } from '../collection-month-wording';
import { LegalEntitiesService } from '../legal-entities.service';
import { day } from '../invoice-dossier-format';
import { MonthlyInvoicesService } from '../monthly-invoices.service';
import { BankReturns } from './bank-returns/bank-returns';
import { BatchHistory } from './batch-history/batch-history';
import { ExcludedOrders } from './excluded-orders/excluded-orders';
import { CardInvoiceSignals } from './card-invoice-signals/card-invoice-signals';
import { UnconfirmedDeliveries } from './unconfirmed-deliveries/unconfirmed-deliveries';
import { MonthInvoices, periodLastDay } from './month-invoices/month-invoices';
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
 * 3. les **clôtures du mois** (plan `facture-emise.md`, par clôture depuis
 *    M4c) : la clôture du lot à préparer en tête, puis les autres dans
 *    l'ordre ; pour chacune ses factures, ses signalements, ses lots et le
 *    bouton qui émet ;
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
    UnconfirmedDeliveries,
    MonthPreview,
    MonthSchedule,
    PendingBatch,
  ],
  providers: [CollectionBatchGestures],
  templateUrl: './prelevement-du-mois-page.html',
  styleUrl: './prelevement-du-mois-page.scss',
})
export class PrelevementDuMoisPage {
  private readonly api = inject(CollectionBatchesService);
  private readonly entitiesApi = inject(LegalEntitiesService);
  private readonly invoicesApi = inject(MonthlyInvoicesService);
  private readonly notify = inject(NotifyService);
  private readonly gestures = inject(CollectionBatchGestures);
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
  protected readonly actionError = this.gestures.actionError;
  protected readonly pending = this.gestures.pending;

  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));

  protected readonly entity = computed(
    () => this.entities().find((entity) => entity.id === this.entityId()) ?? null,
  );

  protected readonly entityOptions = computed(() =>
    this.entities().map((entity) => ({ value: entity.id, label: entity.name })),
  );

  /**
   * Le lot se nomme par la période que ferme la dernière clôture du
   * calendrier (`lastClosurePeriod`, plan `plan-rythme-de-facturation.md`,
   * §16.13) : « du 1er au 4 octobre 2026 ». Le libellé vient du serveur. Les
   * modes d'un lot sont ceux des clients qu'il prélève (Hugo, 2026-10-12) :
   * un lot préparé les porte, le bouton ne les connaît pas.
   */
  private readonly lotName = computed(() => this.entity()?.lastClosurePeriod.label ?? '');

  protected readonly prepareLabel = computed(() => `Préparer le lot ${this.lotName()}`);

  /**
   * Les clôtures du mois (M4c), la clôture du lot à préparer en tête, puis
   * les autres dans l'ordre du calendrier.
   */
  protected readonly closures = computed(() => {
    const all = this.invoices()?.closures ?? [];
    const entity = this.entity();
    const isToPrepare = (closesAt: string): boolean =>
      entity !== null && sameClosure(closesAt, entity.lastClosurePeriod.closesAt);
    return [
      ...all.filter((closure) => isToPrepare(closure.periodClosesAt)),
      ...all.filter((closure) => !isToPrepare(closure.periodClosesAt)),
    ].map((closure) => ({ closure, toPrepare: isToPrepare(closure.periodClosesAt) }));
  });

  /** Pourquoi il n'y a aucun lot à déposer — jamais un vide muet. */
  protected readonly nothingToProcess = computed(() => {
    const lot = `Le lot ${this.lotName()}`;
    const next = this.entity()?.nextCollection.closesAt;
    const after =
      next === undefined ? 'après la prochaine clôture' : `après la clôture du ${longDay(next)}`;
    return this.alreadyPrepared()
      ? `${lot} est déjà déposé ; le suivant se prépare ${after}.`
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
   * Le lot de la dernière clôture est-il déjà là (préparé ou déposé) ? Alors
   * le bouton n'a rien à préparer : il disparaît plutôt que d'attendre son
   * refus.
   */
  protected readonly alreadyPrepared = computed(() => {
    const entity = this.entity();
    if (entity === null) {
      return false;
    }
    return (this.view()?.batches ?? []).some(
      (batch) => !isDeadBatch(batch) && sameClosure(batch.cycleClosesAt, entity.lastClosure),
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
  protected async issueInvoices(periodClosesAt: string): Promise<void> {
    const entityId = this.entityId();
    if (entityId !== null) {
      await this.act('invoices', async () => {
        const report = await this.invoicesApi.issue({ legalEntityId: entityId, periodClosesAt });
        const lastDay = periodLastDay(periodClosesAt);
        const late = report.issued.find((issued) => issued.issuedOn > lastDay);
        this.notify.success(
          (late === undefined ? '' : `Émise(s) en retard, le ${day(late.issuedOn)} — `) +
            `${String(report.issued.length)} facture(s) émise(s), ` +
            `${String(report.blocked.length)} facture(s) signalée(s)` +
            (report.alreadyInvoiced > 0
              ? `, ${String(report.alreadyInvoiced)} déjà émise(s) pour cette période.`
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
      await this.gestures.prepare(
        entityId,
        this.lotName(),
        'Aucun lot préparé : les bons écartés sont listés plus bas.',
        () => this.load(),
      );
    }
  }

  protected async onGesture(
    batch: CollectionBatchView,
    gesture: PendingBatchGesture,
  ): Promise<void> {
    await this.gestures.onGesture(batch, gesture, () => this.load());
  }

  protected async download(download: BatchDownload): Promise<void> {
    await this.gestures.download(download);
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

  /** Un geste de la page elle-même (émettre) : la même mécanique que ceux d'un lot. */
  private async act(key: string, gesture: () => Promise<void>): Promise<void> {
    await this.gestures.run(key, gesture, () => this.load());
  }
}
