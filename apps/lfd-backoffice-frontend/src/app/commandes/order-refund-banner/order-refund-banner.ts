import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { AdminOrderRefund } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { formatCents } from '@lfd/b2b-ui/order';
import { FoldButtonComponent, FoldCalloutComponent, type FoldCalloutVariant } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../orders.service';

/**
 * **Le bandeau du remboursement** d'une commande annulée (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C4, C4.9) : les
 * quatre états LUS au carnet par le serveur, et « Relancer » quand il a un
 * sens.
 *
 * « Relancer » n'attend pas Stripe : le serveur répond `202`, l'écran relit.
 * Désactivé sans `b2b_cancel_order:write` — le droit qui a créé la demande —
 * ou quand Stripe la traite déjà (`retryable` faux).
 */
@Component({
  selector: 'app-order-refund-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './order-refund-banner.html',
})
export class OrderRefundBanner {
  readonly orderId = input.required<string>();
  readonly refund = input.required<AdminOrderRefund | null>();

  /** La demande est relancée : au parent de relire le détail. */
  readonly retried = output<void>();

  private readonly api = inject(AdminOrdersService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly allowed = computed(() => this.permissions.can('b2b_cancel_order:write'));
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly amount = computed(() => {
    const refund = this.refund();
    return refund === null ? '' : formatCents(refund.issuedCents ?? refund.announcedCents);
  });

  /** La couleur dit s'il y a un geste à faire : `alert` quand un humain doit agir. */
  protected readonly variant = computed<FoldCalloutVariant>(() => {
    const refund = this.refund();
    if (refund === null) {
      return 'neutral';
    }
    if (refund.state === 'refunded') {
      return 'success';
    }
    return this.toDo() ? 'alert' : 'info';
  });

  /** « À faire » : échoué chez Stripe, ou pas encore parti après au moins un essai. */
  protected readonly toDo = computed(() => {
    const refund = this.refund();
    return (
      refund !== null &&
      (refund.state === 'failed' || (refund.state === 'to_issue' && refund.attempts > 0))
    );
  });

  protected readonly canRetry = computed(() => {
    const refund = this.refund();
    return refund !== null && (refund.state === 'to_issue' || refund.state === 'failed');
  });

  protected async retry(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.retryRefund(this.orderId());
      this.retried.emit();
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "La relance n'a pas abouti. Réessayez."));
    } finally {
      this.saving.set(false);
    }
  }
}
