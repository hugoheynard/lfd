import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { LoyaltyBalanceView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
  type FoldTableColumn,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { formatPoints, holderKindLabel, holderName } from '../../loyalty-format';
import { LoyaltyService } from '../../loyalty.service';
import {
  AdjustPointsPanel,
  type AdjustPointsPanelData,
} from '../adjust-points-panel/adjust-points-panel';

const BASE_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'holder', label: 'Titulaire' },
  { key: 'kind', label: 'Clientèle' },
  { key: 'points', label: 'Solde' },
];

/**
 * **Les soldes de points, par titulaire** — la société pour un pro, la
 * personne pour un particulier (plan D1). Un solde est la somme du grand
 * livre ; il n'est stocké nulle part.
 *
 * L'ajustement motivé demande `b2b_accounting:write` : sans lui, la colonne
 * d'actions disparaît, et le serveur refuse de toute façon.
 */
@Component({
  selector: 'app-loyalty-balances',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './loyalty-balances.html',
  styleUrl: './loyalty-balances.scss',
})
export class LoyaltyBalances {
  private readonly api = inject(LoyaltyService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly rows = signal<readonly LoyaltyBalanceView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));

  protected readonly columns = computed<readonly FoldTableColumn[]>(() =>
    this.canWrite() ? [...BASE_COLUMNS, { key: 'actions', label: '' }] : BASE_COLUMNS,
  );

  protected readonly rowKey = (row: LoyaltyBalanceView): string =>
    `${row.holder.kind}:${row.holder.id}`;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.rows.set(await this.api.listBalances());
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les soldes de points sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  // Le contexte d'un `foldCell` n'est pas typé : on entre par des méthodes qui
  // rendent la ligne typée.
  protected nameOf(row: LoyaltyBalanceView): string {
    return holderName(row.holder);
  }

  protected kindOf(row: LoyaltyBalanceView): string {
    return holderKindLabel(row.holder);
  }

  protected pointsOf(row: LoyaltyBalanceView): string {
    return formatPoints(row.points);
  }

  protected async adjust(row: LoyaltyBalanceView): Promise<void> {
    const data: AdjustPointsPanelData = { holder: row.holder, points: row.points };
    const done = await this.panels.open<AdjustPointsPanelData, boolean>(AdjustPointsPanel, {
      data,
      width: 'md',
    }).closed;
    if (done !== true) {
      return;
    }
    this.notify.success(`Solde ajusté pour ${holderName(row.holder)}.`);
    await this.reload();
  }

  /** Relecture après un geste : le solde est une somme tenue par le serveur. */
  private async reload(): Promise<void> {
    this.actionError.set(null);
    try {
      this.rows.set(await this.api.listBalances());
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, "Les soldes n'ont pas pu être relus."));
    }
  }
}
