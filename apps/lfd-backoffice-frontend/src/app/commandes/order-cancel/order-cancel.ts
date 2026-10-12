import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { AdminOrderCancellability } from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInlineConfirmComponent,
  FoldTextareaComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../orders.service';

/** La borne du motif — celle que le domaine refuse au-delà (`CancellationReason`). */
export const CANCEL_REASON_MAX_LENGTH = 500;

/**
 * Le seul refus dont le message serveur ne dit rien : `AppErrorFilter` masque
 * celui d'une `TechnicalError` (plan, C3 « écarts », 2) — l'écran dit donc la
 * phrase d'après le code.
 */
const NOT_RECORDED = 'orders.cancel.not_recorded';
const NOT_RECORDED_SENTENCE =
  "Le paiement a été fermé chez Stripe mais l'annulation n'a pas pu être enregistrée. Relancez l'annulation.";

/**
 * **Annuler une commande** depuis son détail staff (plan
 * `documentation/order/plan-annulation-de-commande.md`, C3.8).
 *
 * Absent sans `b2b_cancel_order:write`. Désactivé, avec la phrase du serveur
 * À L'ÉCRAN, quand la commande ne s'annule plus : un tooltip ne se lit pas au
 * téléphone. La confirmation est en ligne, et le motif s'ouvre avec elle.
 */
@Component({
  selector: 'app-order-cancel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './order-cancel.html',
  styleUrl: './order-cancel.scss',
})
export class OrderCancelComponent {
  readonly orderId = input.required<string>();
  readonly cancellability = input.required<AdminOrderCancellability>();

  /** L'annulation est enregistrée : au parent de relire le détail. */
  readonly cancelled = output<void>();

  private readonly api = inject(AdminOrdersService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly maxLength = CANCEL_REASON_MAX_LENGTH;
  protected readonly allowed = computed(() => this.permissions.can('b2b_cancel_order:write'));

  /** La raison du serveur quand elle ne s'annule pas, sinon `null`. */
  protected readonly blocker = computed(() => {
    const c = this.cancellability();
    return c.cancellable ? null : c.reason;
  });

  /**
   * Ce que l'annulation fera du bon de fidélité, dans les mots du serveur
   * (plan, C3b.7) — montré sous la phrase de confirmation ; `null` sans bon.
   */
  protected readonly voucherSentence = computed(() => {
    const c = this.cancellability();
    return c.cancellable ? (c.voucher?.sentence ?? null) : null;
  });

  protected readonly open = signal(false);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Une confirmation tentée sans motif — le champ le dit alors. */
  protected readonly attempted = signal(false);

  private readonly trimmed = computed(() => this.reason().trim());
  protected readonly tooLong = computed(() => this.trimmed().length > CANCEL_REASON_MAX_LENGTH);
  protected readonly missing = computed(() => this.attempted() && this.trimmed() === '');

  protected onOpenChange(open: boolean): void {
    this.open.set(open);
    if (!open) {
      this.reason.set('');
      this.attempted.set(false);
    }
  }

  protected async confirm(): Promise<void> {
    this.attempted.set(true);
    if (this.trimmed() === '' || this.tooLong()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.cancel(this.orderId(), { reason: this.trimmed() });
      this.onOpenChange(false);
      this.cancelled.emit();
    } catch (caught) {
      this.error.set(
        httpErrorCode(caught) === NOT_RECORDED
          ? NOT_RECORDED_SENTENCE
          : httpErrorMessage(caught, "L'annulation n'a pas abouti. Réessayez."),
      );
    } finally {
      this.saving.set(false);
    }
  }
}
