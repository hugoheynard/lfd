import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  CollectionBatchView,
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
  FoldTabPanelComponent,
  FoldTabsComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { CollectionBatchGestures } from '../collection-batch-gestures';
import { CollectionBatchesService } from '../collection-batches.service';
import { longDay } from '../collection-month-wording';
import { CollectionProcedureService } from '../collection-procedure.service';
import { AccountBankExportCard } from '../entites-juridiques/detail/account-bank-export-card/account-bank-export-card';
import { MandateBankExportCard } from '../entites-juridiques/detail/mandate-bank-export-card/mandate-bank-export-card';
import { LegalEntitiesService } from '../legal-entities.service';
import type { PendingBatchGesture } from '../prelevement-du-mois/pending-batch/pending-batch';
import { ProcedureFileStep } from './procedure-file-step/procedure-file-step';
import { ProcedureReturnsStep } from './procedure-returns-step/procedure-returns-step';
import { PROCEDURE_LIST_ROUTE } from './procedure-list-wording';
import {
  LOCK_REASONS,
  STEP_ORDER,
  batchShortLabel,
  deadlineLabel,
  pageTitle,
  procedureTabs,
} from './procedure-wording';

/**
 * **Comptabilité › Procédure de prélèvement** (plan
 * `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`,
 * lot P2) — la procédure écrite (`procedure-de-prelevement.md`), rendue
 * suivable en quatre onglets : comptes, mandats, fichier, retours.
 *
 * Le DÉTAIL d'une procédure (§ 11, Hugo 2026-10-23) : on y arrive depuis la
 * table de toutes les procédures, et « ← Toutes les procédures » y ramène.
 *
 * ## La mémoire est lue, pas tenue
 *
 * L'état des onglets vient du serveur à chaque lecture (S1) ; rien n'est
 * stocké, et l'onglet n'est pas dans l'adresse — un lien vers un onglet
 * verrouillé ouvrirait un mensonge. Seuls la procédure (`:id`, entité ×
 * clôture) et le lot (`lot`) y sont. Après chaque geste d'une carte
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
    ProcedureFileStep,
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
  protected readonly gestures = inject(CollectionBatchGestures);

  protected readonly listRoute = PROCEDURE_LIST_ROUTE;
  protected readonly entities = signal<readonly LegalEntityView[]>([]);
  /** La procédure de l'adresse (entité × clôture) — l'identifiant que la table donne. */
  private readonly procedureId = signal(this.route.snapshot.paramMap.get('id') ?? '');
  /** Le lot de l'adresse ; `null` = celui que le serveur choisit (§ 4.3). */
  private readonly lot = signal<string | null>(this.route.snapshot.queryParamMap.get('lot'));
  protected readonly view = signal<CollectionProcedureView | null>(null);
  private readonly batches = signal<readonly CollectionBatchView[]>([]);
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
  /** Le lot suivi, tel que « Prélèvement du mois » le lit — pour réutiliser ses cartes. */
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

  constructor() {
    void this.load();
  }

  /** Les entités, puis l'état ; l'onglet ouvert est le premier qui attend un geste. */
  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.entities.set(await this.entitiesApi.list());
      await this.refresh();
      this.tab.set(this.view()?.arrivalStep ?? 'accounts');
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
  }

  /** Revenir au lot que la règle choisit pour cette procédure. */
  protected async followDefault(): Promise<void> {
    await this.pin(this.procedureId(), null);
    await this.load();
  }

  /**
   * Suivre un autre lot : sa procédure et lui entrent dans l'adresse, et la
   * page relit — un lot d'une autre clôture est une autre procédure.
   */
  protected async follow(batchId: string): Promise<void> {
    const lot = this.view()?.openBatches.find((batch) => batch.id === batchId);
    await this.pin(lot?.procedureId ?? this.procedureId(), batchId);
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
        'Aucun lot préparé : les bons écartés sont listés sur « Prélèvement du mois ».',
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
