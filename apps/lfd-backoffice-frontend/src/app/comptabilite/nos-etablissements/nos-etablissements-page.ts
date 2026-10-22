import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OwnEstablishmentView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { formatOrderDate } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { CollectionTestsService } from '../collection-tests.service';
import {
  DeclareEstablishmentPanel,
  type DeclareEstablishmentPanelData,
} from './declare-establishment-panel/declare-establishment-panel';
import { PRE_NOTIFICATION_DECISION } from './pre-notification-decision';

const BASE_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'company', label: 'Société' },
  { key: 'since', label: 'Déclarée le' },
  { key: 'by', label: 'Par' },
];

/**
 * **Comptabilité › Nos établissements** — les sociétés clientes qui sont à
 * nous, seules visées par le prélèvement d'essai (plan
 * `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`, Q1).
 *
 * Une page à elle, et pas une case de la fiche « Informations » de la société
 * (Hugo, 2026-10-22) : dire qu'une société est à nous ouvre un geste sur son
 * compte bancaire, ce n'est pas une donnée d'identité. La page affiche la
 * décision écrite de pré-notification (Q6).
 */
@Component({
  selector: 'app-nos-etablissements-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './nos-etablissements-page.html',
  styleUrl: './nos-etablissements-page.scss',
})
export class NosEtablissementsPage {
  private readonly api = inject(CollectionTestsService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly decision = PRE_NOTIFICATION_DECISION;
  protected readonly rows = signal<readonly OwnEstablishmentView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly pending = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('collection_test:write'));
  protected readonly columns = computed<readonly FoldTableColumn[]>(() =>
    this.canWrite() ? [...BASE_COLUMNS, { key: 'actions', label: '' }] : BASE_COLUMNS,
  );
  protected readonly empty = computed(() => !this.loading() && this.rows().length === 0);
  protected readonly rowKey = (row: OwnEstablishmentView): string => row.companyId;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.rows.set((await this.api.ownEstablishments()).establishments);
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Nos établissements sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected sinceOf(row: OwnEstablishmentView): string {
    return formatOrderDate(row.declaredAt);
  }

  protected async declare(): Promise<void> {
    const data: DeclareEstablishmentPanelData = {
      declaredIds: this.rows().map((row) => row.companyId),
    };
    const done = await this.panels.open<DeclareEstablishmentPanelData, string>(
      DeclareEstablishmentPanel,
      { data },
    ).closed;
    if (done === undefined) {
      return;
    }
    this.notify.success('Établissement déclaré.');
    await this.reload();
  }

  protected async withdraw(row: OwnEstablishmentView): Promise<void> {
    this.pending.set(row.companyId);
    this.actionError.set(null);
    try {
      await this.api.withdraw(row.companyId);
      this.notify.success(`${row.companyName} n’est plus déclarée parmi nos établissements.`);
      await this.reload();
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, 'L’établissement n’a pas pu être retiré.'));
    } finally {
      this.pending.set(null);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.rows.set((await this.api.ownEstablishments()).establishments);
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, 'La liste n’a pas pu être relue.'));
    }
  }
}
