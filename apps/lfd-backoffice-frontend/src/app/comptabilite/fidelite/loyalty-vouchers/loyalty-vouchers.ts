import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { LoyaltyVoucherView } from '@lfd/contracts';
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

import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { formatPoints, formatRatio, holderName, voucherStatusBadge } from '../../loyalty-format';
import { LoyaltyService } from '../../loyalty.service';
import { CancelVoucherPanel } from '../cancel-voucher-panel/cancel-voucher-panel';

const BASE_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'holder', label: 'Titulaire' },
  { key: 'value', label: 'Montant' },
  { key: 'cost', label: 'Coût' },
  { key: 'issuedAt', label: 'Émis le' },
  { key: 'expiresAt', label: "Valable jusqu'au" },
  { key: 'status', label: 'État' },
];

/**
 * **Les bons de fidélité émis** — leur montant, les points qu'ils ont coûté et le
 * ratio appliqué, tous figés à l'émission (plan D5), et leur état lu
 * maintenant : un bon dont la date limite est passée se lit « expiré ».
 *
 * Seul un bon **disponible** s'annule (plan D7), et le geste demande
 * `b2b_accounting:write` : sans lui, la colonne d'actions disparaît.
 */
@Component({
  selector: 'app-loyalty-vouchers',
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
  templateUrl: './loyalty-vouchers.html',
  styleUrl: './loyalty-vouchers.scss',
})
export class LoyaltyVouchers {
  private readonly api = inject(LoyaltyService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly rows = signal<readonly LoyaltyVoucherView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));

  protected readonly columns = computed<readonly FoldTableColumn[]>(() =>
    this.canWrite() ? [...BASE_COLUMNS, { key: 'actions', label: '' }] : BASE_COLUMNS,
  );

  protected readonly rowKey = (row: LoyaltyVoucherView): string => row.id;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.rows.set(await this.api.listVouchers());
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les bons de fidélité sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  // Le contexte d'un `foldCell` n'est pas typé : on entre par des méthodes qui
  // rendent la ligne typée.
  protected nameOf(row: LoyaltyVoucherView): string {
    return holderName(row.holder);
  }

  protected valueOf(row: LoyaltyVoucherView): string {
    return formatCents(row.valueCents);
  }

  protected costOf(row: LoyaltyVoucherView): string {
    return `${formatPoints(row.pointsCost)} points`;
  }

  protected ratioOf(row: LoyaltyVoucherView): string {
    return formatRatio(row.ratio);
  }

  protected issuedOf(row: LoyaltyVoucherView): string {
    return formatOrderDate(row.issuedAt);
  }

  protected expiresOf(row: LoyaltyVoucherView): string {
    return formatOrderDate(row.expiresAt);
  }

  protected statusOf(row: LoyaltyVoucherView): ReturnType<typeof voucherStatusBadge> {
    return voucherStatusBadge(row.status);
  }

  protected isAvailable(row: LoyaltyVoucherView): boolean {
    return row.status === 'available';
  }

  protected async cancel(row: LoyaltyVoucherView): Promise<void> {
    const done = await this.panels.open<LoyaltyVoucherView, boolean>(CancelVoucherPanel, {
      data: row,
      width: 'md',
    }).closed;
    if (done !== true) {
      return;
    }
    this.notify.success(
      `Bon annulé : ${formatPoints(row.pointsCost)} points recrédités à ${holderName(row.holder)}.`,
    );
    await this.reload();
  }

  /** Relecture après un geste : l'état et le motif sont posés par le serveur. */
  private async reload(): Promise<void> {
    this.actionError.set(null);
    try {
      this.rows.set(await this.api.listVouchers());
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, "Les bons n'ont pas pu être relus."));
    }
  }
}
