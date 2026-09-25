import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OrderAwaitingPaymentView } from '@lfd/contracts';
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
  type FoldTableColumn,
} from 'fold-ng';

import { formatCents, formatOrderDate } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { copyLink } from '../../copy-link';
import { PaymentLinksService } from '../../payment-links.service';

const BASE_COLUMNS: readonly FoldTableColumn[] = [
  { key: 'company', label: 'Société' },
  { key: 'reference', label: 'Commande' },
  { key: 'amount', label: 'Montant' },
  { key: 'placedAt', label: 'Passée le' },
  { key: 'status', label: 'Règlement' },
  { key: 'link', label: 'Lien' },
];

/**
 * **Les commandes à régler par carte** — règlement en attente ou refusé, non
 * annulées. On y copie le lien de paiement, ou on le renvoie par e-mail à
 * l'acheteur.
 *
 * Une commande sans lien (`paymentUrl: null`) le dit sur sa ligne : l'espace
 * client n'a pas d'adresse publique configurée, et le serveur refuserait le
 * renvoi. L'écran ne propose donc pas un geste qu'il sait voué au refus.
 */
@Component({
  selector: 'app-orders-to-settle',
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
  templateUrl: './orders-to-settle.html',
  styleUrl: './orders-to-settle.scss',
})
export class OrdersToSettle {
  private readonly api = inject(PaymentLinksService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly rows = signal<readonly OrderAwaitingPaymentView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  /** La commande dont le renvoi est en vol. */
  protected readonly pending = signal<string | null>(null);

  /** Renvoyer un e-mail est un geste : `b2b_accounting:write`. Copier ne l'est pas. */
  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));

  protected readonly columns = BASE_COLUMNS;
  protected readonly rowKey = (row: OrderAwaitingPaymentView): string => row.orderId;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.rows.set(await this.api.listOrders());
    } catch (caught) {
      this.loadError.set(httpErrorMessage(caught, 'Les commandes à régler sont illisibles.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected companyOf(row: OrderAwaitingPaymentView): string {
    return row.companyName ?? 'Client particulier';
  }

  protected amountOf(row: OrderAwaitingPaymentView): string {
    return formatCents(row.totalCents);
  }

  protected dateOf(row: OrderAwaitingPaymentView): string {
    return formatOrderDate(row.placedAt);
  }

  protected async copy(row: OrderAwaitingPaymentView): Promise<void> {
    if (row.paymentUrl !== null) {
      await copyLink(row.paymentUrl, this.notify);
    }
  }

  protected async resend(row: OrderAwaitingPaymentView): Promise<void> {
    this.pending.set(row.orderId);
    this.actionError.set(null);
    try {
      await this.api.resendOrderLink(row.orderId);
      this.notify.success(`Lien de paiement renvoyé pour la commande ${row.reference}.`);
    } catch (caught) {
      this.actionError.set(httpErrorMessage(caught, "Le lien n'a pas pu être renvoyé."));
    } finally {
      this.pending.set(null);
    }
  }
}
