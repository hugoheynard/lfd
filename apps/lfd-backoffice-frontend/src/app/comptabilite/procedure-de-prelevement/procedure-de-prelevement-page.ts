import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  CollectionBatchView,
  CollectionExclusionView,
  CollectionPreviewView,
  CollectionProcedureStepKeyView,
  CollectionProcedureView,
  LegalEntityView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldTabPanelComponent,
  FoldTabsComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { CollectionBatchGestures } from '../collection-batch-gestures';
import { CollectionBatchesService } from '../collection-batches.service';
import { isDeadBatch } from '../collection-batch-steps';
import { longDay } from '../collection-month-wording';
import { CollectionProcedureService } from '../collection-procedure.service';
import { AccountBankExportCard } from '../entites-juridiques/detail/account-bank-export-card/account-bank-export-card';
import { MandateBankExportCard } from '../entites-juridiques/detail/mandate-bank-export-card/mandate-bank-export-card';
import { LegalEntitiesService } from '../legal-entities.service';
import { MonthlyInvoicesService } from '../monthly-invoices.service';
import { NotifyService } from '../../notify.service';
import { issuedInvoicesSentence } from './issued-invoices-sentence';
import { MonthPreview } from './month-preview/month-preview';
import type { PendingBatchGesture } from './pending-batch/pending-batch';
import { ProcedureInvoicesStep } from './procedure-invoices-step/procedure-invoices-step';
import { SettlePanel } from './settle-panel/settle-panel';
import {
  ProcedureFileStep,
  type OtherBatchGesture,
} from './procedure-file-step/procedure-file-step';
import { ProcedureReturnsStep } from './procedure-returns-step/procedure-returns-step';
import { PROCEDURE_LIST_ROUTE } from './procedure-list-wording';
import { PROCEDURE_TAB_PARAM, requestedTab } from './procedure-tab-param';
import {
  LOCK_REASONS,
  STEP_ORDER,
  batchShortLabel,
  deadlineLabel,
  pageTitle,
  isPooled,
  pooledSentence,
  procedureTabs,
} from './procedure-wording';

/**
 * **Comptabilité › Procédure de prélèvement** (plan
 * `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * lot P2) — la procédure écrite (`procedure-de-prelevement.md`), rendue
 * suivable en cinq onglets : comptes, mandats, factures, fichier, retours.
 * « Factures » (2026-10-24) a repris de « Prélèvement du mois », retiré le
 * même jour, les factures de la période, les bons à constater, les bons
 * écartés et l'émission ; l'aperçu du lot à venir est dans « Fichier ».
 *
 * Le DÉTAIL d'une procédure (§ 11, Hugo 2026-10-23) : on y arrive depuis la
 * table de toutes les procédures, et « ← Toutes les procédures » y ramène.
 *
 * ## La mémoire est lue, pas tenue
 *
 * L'état des onglets vient du serveur à chaque lecture (S1) ; rien n'est
 * stocké, et l'onglet n'est pas dans l'adresse — un lien vers un onglet
 * verrouillé ouvrirait un mensonge. Seuls la procédure (`:id`, entité ×
 * clôture) et le lot (`lot`, celui d'une ancienne adresse) y sont. Le détail
 * ne montre que SA procédure : la liste des lots ouverts et « Suivre » ont
 * été retirés le 2026-10-23 — la table des procédures fait ce choix. Après chaque geste d'une carte
 * (`changed`) ou d'un lot, l'état est relu ; l'onglet ouvert ne change qu'à
 * l'arrivée.
 *
 * Un onglet verrouillé reste sélectionnable et dit pourquoi (Q6, option A).
 */
@Component({
  selector: 'app-procedure-de-prelevement-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AccountBankExportCard,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldTabPanelComponent,
    FoldTabsComponent,
    MandateBankExportCard,
    MonthPreview,
    ProcedureFileStep,
    ProcedureInvoicesStep,
    ProcedureReturnsStep,
  ],
  providers: [CollectionBatchGestures],
  templateUrl: './procedure-de-prelevement-page.html',
  styleUrl: './procedure-de-prelevement-page.scss',
})
export class ProcedureDePrelevementPage {
  private readonly entitiesApi = inject(LegalEntitiesService);
  private readonly procedureApi = inject(CollectionProcedureService);
  private readonly batchesApi = inject(CollectionBatchesService);
  private readonly permissions = inject(PermissionsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invoicesApi = inject(MonthlyInvoicesService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);
  protected readonly gestures = inject(CollectionBatchGestures);

  protected readonly listRoute = PROCEDURE_LIST_ROUTE;
  protected readonly entities = signal<readonly LegalEntityView[]>([]);
  /** La procédure de l'adresse (entité × clôture) — l'identifiant que la table donne. */
  private readonly procedureId = signal(this.route.snapshot.paramMap.get('id') ?? '');
  /** Le lot de l'adresse ; `null` = celui que le serveur choisit (§ 4.3). */
  private readonly lot = signal<string | null>(this.route.snapshot.queryParamMap.get('lot'));
  protected readonly view = signal<CollectionProcedureView | null>(null);
  private readonly batches = signal<readonly CollectionBatchView[]>([]);
  /** Les bons écartés à la dernière préparation — l'onglet « Factures » les montre. */
  protected readonly exclusions = signal<readonly CollectionExclusionView[]>([]);
  /** L'aperçu du lot à venir, lu seulement sans lot suivi ; son échec ne coûte que sa carte. */
  protected readonly preview = signal<CollectionPreviewView | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly tab = signal<CollectionProcedureStepKeyView>('accounts');
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));
  protected readonly entityId = computed(() => this.view()?.legalEntityId ?? null);
  protected readonly entity = computed(
    () => this.entities().find((entity) => entity.id === this.entityId()) ?? null,
  );
  protected readonly title = computed(() => pageTitle(this.view()));
  protected readonly tabs = computed(() => {
    const view = this.view();
    return view === null ? [] : procedureTabs(view);
  });
  /**
   * Les AUTRES lots de la procédure (l'autre schéma, ou le lot préparé de
   * nouveau après une annulation) : l'onglet 3 les montre tous, sans
   * « suivre » (2026-10-23).
   */
  protected readonly otherBatches = computed(() => {
    const view = this.view();
    const ids = new Set((view?.procedureBatches ?? []).map((batch) => batch.id));
    return this.batches().filter(
      (batch) => ids.has(batch.id) && batch.id !== view?.followed?.id && !isDeadBatch(batch),
    );
  });
  /** Le lot suivi, tel que la lecture des lots le rend — pour réutiliser ses cartes. */
  protected readonly followedBatch = computed(
    () => this.batches().find((batch) => batch.id === this.view()?.followed?.id) ?? null,
  );
  protected readonly stepState = computed(() => this.view()?.[this.tab()].state ?? 'locked');
  protected readonly lockReason = computed(() => LOCK_REASONS[this.tab()] ?? null);
  protected readonly hasNext = computed(
    () => STEP_ORDER.indexOf(this.tab()) < STEP_ORDER.length - 1,
  );

  protected readonly shortLabel = batchShortLabel;
  protected readonly deadline = deadlineLabel;
  protected readonly longDay = longDay;
  protected readonly pooled = isPooled;
  protected readonly pooledSentence = pooledSentence;

  constructor() {
    void this.load();
  }

  /** Les entités, puis l'état ; l'onglet ouvert est celui de `?onglet=`, sinon le premier qui attend un geste. */
  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.entities.set(await this.entitiesApi.list());
      await this.refresh();
      const asked = requestedTab(this.route.snapshot.queryParamMap.get(PROCEDURE_TAB_PARAM));
      this.tab.set(asked ?? this.view()?.arrivalStep ?? 'accounts');
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'La procédure de prélèvement est illisible.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Relit l'état et les lots sans changer d'onglet — après chaque geste. */
  protected async refresh(): Promise<void> {
    const view = await this.procedureApi.read({ procedureId: this.procedureId() }, this.lot());
    const cycle = await this.batchesApi.cycle(view.legalEntityId);
    this.view.set(view);
    this.batches.set(cycle.batches);
    this.exclusions.set(cycle.exclusions);
    await this.loadPreview(view);
  }

  /** L'aperçu de ce que le prochain lot prélèverait — avant préparation seulement. */
  private async loadPreview(view: CollectionProcedureView): Promise<void> {
    this.previewError.set(null);
    if (view.followed !== null) {
      this.preview.set(null);
      return;
    }
    try {
      this.preview.set(await this.batchesApi.preview(view.legalEntityId));
    } catch (caught) {
      this.preview.set(null);
      this.previewError.set(httpErrorMessage(caught, 'L’aperçu du lot est illisible.'));
    }
  }

  /** « Émettre les factures de … » — rejouable ; le compte rendu dit ce qui est parti. */
  protected async issueInvoices(periodClosesAt: string): Promise<void> {
    const entityId = this.entityId();
    if (entityId !== null) {
      await this.gestures.run(
        'invoices',
        async () => {
          const report = await this.invoicesApi.issue({ legalEntityId: entityId, periodClosesAt });
          this.notify.success(issuedInvoicesSentence(report, periodClosesAt));
        },
        () => this.refresh(),
      );
    }
  }

  /** « Réglée autrement » sur un bon écarté : le panneau, puis l'état relu. */
  protected async settle(row: CollectionExclusionView): Promise<void> {
    const done = await this.panels.open<CollectionExclusionView, boolean>(SettlePanel, {
      data: row,
      width: 'md',
    }).closed;
    if (done === true) {
      await this.onCardChanged();
    }
  }

  /** Revenir au lot que la règle choisit pour cette procédure. */
  protected async followDefault(): Promise<void> {
    await this.pin(this.procedureId(), null);
    await this.load();
  }

  /** Une clôture manquée renvoie à la dernière, dont le lot la reprend. */
  protected async openLatest(procedureId: string): Promise<void> {
    await this.pin(procedureId, null);
    await this.load();
  }

  protected async prepare(): Promise<void> {
    const entityId = this.entityId();
    if (entityId !== null) {
      await this.gestures.prepare(
        entityId,
        this.view()?.toPrepare?.periodLabel ?? '',
        'Aucun lot préparé : les bons écartés sont listés dans l’onglet « Factures ».',
        () => this.refresh(),
      );
    }
  }

  protected async onGesture(gesture: PendingBatchGesture): Promise<void> {
    const batch = this.followedBatch();
    if (batch !== null) {
      await this.gestures.onGesture(batch, gesture, () => this.refresh());
    }
  }

  /** Un geste sur un autre lot de la procédure. */
  protected async onOtherGesture(event: OtherBatchGesture): Promise<void> {
    const batch = this.batches().find((candidate) => candidate.id === event.batchId);
    if (batch !== undefined) {
      await this.gestures.onGesture(batch, event.gesture, () => this.refresh());
    }
  }

  /** Un geste d'une carte : l'état est relu, l'onglet reste. */
  protected async onCardChanged(): Promise<void> {
    try {
      await this.refresh();
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'La procédure de prélèvement est illisible.'));
    }
  }

  protected next(): void {
    const following = STEP_ORDER[STEP_ORDER.indexOf(this.tab()) + 1];
    if (following !== undefined) {
      this.tab.set(following);
    }
  }

  protected goTo(key: CollectionProcedureStepKeyView): void {
    this.tab.set(key);
  }

  private async pin(procedureId: string, batchId: string | null): Promise<void> {
    this.procedureId.set(procedureId);
    this.lot.set(batchId);
    await this.router.navigate([PROCEDURE_LIST_ROUTE, procedureId], {
      queryParams: batchId === null ? {} : { lot: batchId },
      replaceUrl: true,
    });
  }
}
