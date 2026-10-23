import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  CollectionProcedureListView,
  CollectionProcedureRowView,
  LegalEntityView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { CollectionProcedureService } from '../../collection-procedure.service';
import { LegalEntitiesService } from '../../legal-entities.service';
import {
  PROCEDURE_LIST_ROUTE,
  deadlineMissed,
  procedureRowTitle,
  rejectedByBankLabel,
  rowClosureLabel,
  rowCollectionLabel,
  rowDeadlineLabel,
  rowTone,
  stageLabel,
  stageVariant,
  warningText,
  warningVariant,
} from '../procedure-list-wording';
import { PAGE_TITLE, POOLED_BADGE, isPooled, pooledTitle } from '../procedure-wording';

const COLUMNS: readonly FoldTableColumn<CollectionProcedureRowView>[] = [
  { key: 'code', label: 'Code' },
  { key: 'period', label: 'Rythme · période' },
  { key: 'stage', label: 'Étape en cours' },
  { key: 'closure', label: 'Clôture' },
  { key: 'deadline', label: 'Limite de dépôt' },
  { key: 'collection', label: 'Prélèvement' },
  { key: 'warnings', label: 'Avertissements' },
];

/**
 * **Comptabilité › Procédure de prélèvement** — l'arrivée : la table de
 * toutes les procédures de l'entité (plan
 * `plan-page-procedure-de-prelevement.md`, § 11, Hugo 2026-10-23). Une
 * procédure = une clôture ; une ligne mène à son détail, en quatre onglets.
 *
 * Le serveur rend les lignes triées (limite de dépôt la plus proche d'abord,
 * closes à la fin) avec leur étape et leurs avertissements : l'écran ne
 * recalcule rien. « Afficher les closes » relit avec les trois derniers mois.
 *
 * Les anciennes adresses `?entite=&lot=` (tableau de bord, liens gardés)
 * mènent au détail du lot qu'elles désignent.
 */
@Component({
  selector: 'app-procedure-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCheckboxComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './procedure-list-page.html',
  styleUrl: './procedure-list-page.scss',
})
export class ProcedureListPage {
  private readonly entitiesApi = inject(LegalEntitiesService);
  private readonly procedureApi = inject(CollectionProcedureService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly title = PAGE_TITLE;
  protected readonly columns = COLUMNS;
  protected readonly pooled = isPooled;
  protected readonly pooledTitle = pooledTitle;
  protected readonly pooledBadge = POOLED_BADGE;
  protected readonly entities = signal<readonly LegalEntityView[]>([]);
  protected readonly entityId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('entite'),
  );
  protected readonly includeClosed = signal(false);
  protected readonly list = signal<CollectionProcedureListView | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly entityOptions = computed(() =>
    this.entities().map((entity) => ({ value: entity.id, label: entity.name })),
  );
  protected readonly rows = computed(() => this.list()?.rows ?? []);

  protected readonly rowKey = (row: CollectionProcedureRowView): string => row.id;
  protected readonly rowTone = rowTone;
  protected readonly rowTitle = procedureRowTitle;
  protected readonly stageLabel = stageLabel;
  protected readonly stageVariant = stageVariant;
  protected readonly rejectedByBank = rejectedByBankLabel;
  protected readonly deadlineLabel = rowDeadlineLabel;
  protected readonly deadlineMissed = deadlineMissed;
  protected readonly collectionLabel = rowCollectionLabel;
  protected readonly closureLabel = rowClosureLabel;
  protected readonly warningText = warningText;
  protected readonly warningVariant = warningVariant;
  protected readonly nothing = {
    title: 'Aucune procédure',
    subtitle: 'Aucune clôture à venir ni ouverte pour cette entité.',
  };

  constructor() {
    void this.load();
  }

  /** Les entités, une ancienne adresse redirigée, puis la table. */
  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const living = (await this.entitiesApi.list()).filter((entity) => entity.archivedAt === null);
      this.entities.set(living);
      const known = living.some((entity) => entity.id === this.entityId());
      this.entityId.set(known ? this.entityId() : (living[0]?.id ?? null));
      if (await this.redirectLegacyAddress()) {
        return;
      }
      await this.refresh();
    } catch (caught) {
      this.loadError.set(
        httpErrorMessage(caught, 'Les procédures de prélèvement sont illisibles.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async choose(entityId: string | null): Promise<void> {
    this.entityId.set(entityId);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { entite: entityId },
      replaceUrl: true,
    });
    await this.load();
  }

  protected async showClosed(include: boolean): Promise<void> {
    this.includeClosed.set(include);
    await this.load();
  }

  protected async open(row: CollectionProcedureRowView): Promise<void> {
    await this.router.navigate([PROCEDURE_LIST_ROUTE, row.id]);
  }

  private async refresh(): Promise<void> {
    const entityId = this.entityId();
    this.list.set(
      entityId === null ? null : await this.procedureApi.list(entityId, this.includeClosed()),
    );
  }

  /**
   * `?entite=&lot=` — l'adresse d'avant la table : le détail de la procédure
   * qui porte ce lot, sur ce lot. Vrai si la page a été quittée.
   */
  private async redirectLegacyAddress(): Promise<boolean> {
    const lot = this.route.snapshot.queryParamMap.get('lot');
    const entityId = this.entityId();
    if (lot === null || entityId === null) {
      return false;
    }
    const view = await this.procedureApi.read({ legalEntityId: entityId }, lot);
    const procedureId = view.followed?.procedureId;
    if (procedureId === undefined) {
      return false;
    }
    await this.router.navigate([PROCEDURE_LIST_ROUTE, procedureId], {
      queryParams: { lot },
      replaceUrl: true,
    });
    return true;
  }
}
