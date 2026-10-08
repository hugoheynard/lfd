import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  COLLECTION_BATCH_STATUS_LABELS,
  COLLECTION_EXCLUSION_REASON_LABELS,
  type CollectionBatchView,
  type CollectionCycleView,
  type CollectionExclusionView,
  type LegalEntityView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { saveBlob } from '../../shared/download/save-blob';
import { CollectionBatchesService } from '../collection-batches.service';
import { LegalEntitiesService } from '../legal-entities.service';
import { BatchLines } from './batch-lines/batch-lines';
import { SettlePanel } from './settle-panel/settle-panel';

const BATCH_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'cycle', label: 'Cycle' },
  { key: 'scheme', label: 'Schéma' },
  { key: 'status', label: 'État' },
  { key: 'lines', label: 'Débiteurs · commandes' },
  { key: 'amount', label: 'Montant' },
  { key: 'actions', label: 'Fichiers et gestes' },
];

const EXCLUSION_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'order', label: 'Commande' },
  { key: 'company', label: 'Société' },
  { key: 'amount', label: 'Montant' },
  { key: 'reason', label: 'Raison' },
  { key: 'actions', label: '' },
];

/**
 * **Comptabilité › Lots de prélèvement** — l'écran du cycle (plan
 * `documentation/comptabilite/plan-lot-de-prelevement-fige.md`, P2).
 *
 * Les lots d'une entité et leurs états ; les commandes écartées et leur raison ;
 * les gestes constituer, annuler, marquer déposé, réglée autrement ; les deux
 * téléchargements d'un lot, relus tels qu'ils ont été figés.
 *
 * 🔴 Les sociétés sans mandat sont nommées EN TÊTE : elles rendent le lot non
 * déposable (Q2), et c'est le premier geste à faire. Les bons non facturables
 * le sont aussi : écartés du lot, ils reviennent au suivant une fois corrigés
 * (plan `plan-le-prelevement-suit-la-facture.md`, F4).
 */
@Component({
  selector: 'app-lots-de-prelevement-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BatchLines,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './lots-de-prelevement-page.html',
  styleUrl: './lots-de-prelevement-page.scss',
})
export class LotsDePrelevementPage {
  private readonly api = inject(CollectionBatchesService);
  private readonly entitiesApi = inject(LegalEntitiesService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly entities = signal<readonly LegalEntityView[]>([]);
  protected readonly entityId = signal<string | null>(null);
  protected readonly view = signal<CollectionCycleView | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly pending = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));
  protected readonly batchColumns = BATCH_COLUMNS;
  protected readonly exclusionColumns = EXCLUSION_COLUMNS;
  protected readonly batchKey = (row: CollectionBatchView): string => row.id;
  protected readonly exclusionKey = (row: CollectionExclusionView): string => row.orderId;

  protected readonly entityOptions = computed(() =>
    this.entities().map((entity) => ({ value: entity.id, label: entity.name })),
  );

  /** Les sociétés sans mandat des lots encore à déposer — nommées en tête. */
  protected readonly unmandated = computed(() => {
    const names = (this.view()?.batches ?? [])
      .filter((batch) => batch.status === 'constituted')
      .flatMap((batch) => batch.unmandatedCompanies);
    return [...new Set(names)];
  });

  /** Les bons non facturables, écartés du lot — nommés en tête (F4). */
  protected readonly unbillable = computed(() =>
    (this.view()?.exclusions ?? [])
      .filter((exclusion) => exclusion.reason === 'unbillable')
      .map((exclusion) => `${exclusion.orderNumber} (${exclusion.companyName})`),
  );

  /** Les lots qui ont des lignes à détailler. */
  protected readonly batchesWithLines = computed(() =>
    (this.view()?.batches ?? []).filter((batch) => batch.lines.length > 0),
  );

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
      this.view.set(chosen === null ? null : await this.api.cycle(chosen));
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les lots de prélèvement sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async choose(entityId: string | null): Promise<void> {
    this.entityId.set(entityId);
    await this.load();
  }

  protected statusOf(row: CollectionBatchView): string {
    return COLLECTION_BATCH_STATUS_LABELS[row.status];
  }

  protected reasonOf(row: CollectionExclusionView): string {
    return COLLECTION_EXCLUSION_REASON_LABELS[row.reason];
  }

  protected cycleOf(row: CollectionBatchView): string {
    return `${formatOrderDate(row.cycleStartsAt)} → clôture ${formatOrderDate(row.cycleClosesAt)}`;
  }

  protected cents(amount: number): string {
    return formatCents(amount);
  }

  protected dateOf(iso: string): string {
    return formatOrderDate(iso);
  }

  protected async constitute(): Promise<void> {
    const entityId = this.entityId();
    if (entityId !== null) {
      await this.act('constitute', async () => {
        const { batchIds } = await this.api.constitute(entityId);
        this.notify.success(
          batchIds.length === 0
            ? 'Aucun lot créé : les commandes écartées sont listées plus bas.'
            : `${String(batchIds.length)} lot(s) constitué(s).`,
        );
      });
    }
  }

  protected async cancel(row: CollectionBatchView): Promise<void> {
    await this.act(row.id, async () => {
      await this.api.cancel(row.id);
      this.notify.success('Lot annulé : ses commandes repassent à prélever.');
    });
  }

  protected async deposit(row: CollectionBatchView): Promise<void> {
    await this.act(row.id, async () => {
      await this.api.deposit(row.id);
      this.notify.success('Lot marqué déposé.');
    });
  }

  protected async download(row: CollectionBatchView, kind: 'xml' | 'csv'): Promise<void> {
    this.actionError.set(null);
    try {
      const file = kind === 'xml' ? await this.api.file(row.id) : await this.api.audit(row.id);
      saveBlob(file.blob, file.fileName ?? `lot-${row.id}.${kind}`);
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
