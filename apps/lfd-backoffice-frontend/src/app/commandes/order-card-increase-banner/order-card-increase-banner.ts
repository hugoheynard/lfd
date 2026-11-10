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
import type { AdminOrderCardIncrease } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { formatCents } from '@lfd/b2b-ui/order';
import { FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminOrdersService } from '../orders.service';

/**
 * **La hausse par carte qui attend**, sur la fiche commande (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.10) : le
 * complément, où il en est, et les deux gestes de l'équipe — « Abandonner »
 * tant qu'il n'est pas payé (§2.5), « Relancer » quand la modification payée
 * est bloquée (§2.6). Rien sans projet vivant. Les deux gestes sont
 * désactivés sans `b2b_orders:write`, le droit qui modifie une commande ; le
 * parent relit la fiche après chacun.
 */
@Component({
  selector: 'app-order-card-increase-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent],
  templateUrl: './order-card-increase-banner.html',
})
export class OrderCardIncreaseBanner {
  readonly orderId = input.required<string>();
  readonly increase = input.required<AdminOrderCardIncrease | null>();

  /** Un geste a abouti : au parent de relire la fiche. */
  readonly changed = output<void>();

  private readonly api = inject(AdminOrdersService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly allowed = computed(() => this.permissions.can('b2b_orders:write'));
  protected readonly amount = computed(() => {
    const increase = this.increase();
    return increase === null ? '' : formatCents(increase.complementCents);
  });

  protected readonly saving = signal(false);
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async abandon(): Promise<void> {
    await this.run(() => this.api.abandonCardIncrease(this.orderId()), {
      fallback: "Le complément n'a pas pu être abandonné. Réessayez.",
      onSuccess: () => this.confirming.set(false),
    });
  }

  protected async relaunch(): Promise<void> {
    await this.run(() => this.api.relaunchCardIncrease(this.orderId()), {
      fallback: "La modification n'a pas pu être relancée. Réessayez.",
    });
  }

  private async run(
    gesture: () => Promise<void>,
    outcome: { readonly fallback: string; readonly onSuccess?: () => void },
  ): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await gesture();
      outcome.onSuccess?.();
      this.changed.emit();
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, outcome.fallback));
    } finally {
      this.saving.set(false);
    }
  }
}
