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
import { RouterLink } from '@angular/router';
import type { AdminBackorderView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { BackorderLines } from '../backorder-lines/backorder-lines';
import { AdminBackordersService } from '../backorders.service';

/**
 * **Le reliquat d'une commande d'origine**, sur sa fiche (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5) : son
 * état, ce qui reste dû, et la commande qui en est issue. Tant qu'il est
 * ouvert, deux gestes :
 *
 * - « Transformer » (pro seulement, `b2b_place_order:write`) mène à la saisie
 *   garnie du reliquat — c'est passer une commande à la place du client ;
 * - « Abandonner » (`b2b_orders_shortfall:write`, le droit de la décision du
 *   départ qui l'a fait naître), après confirmation. Le parent relit la fiche.
 *
 * Rien sans reliquat.
 */
@Component({
  selector: 'app-order-backorder-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackorderLines,
    DatePipe,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInlineConfirmComponent,
    RouterLink,
  ],
  templateUrl: './order-backorder-card.html',
  styleUrl: './order-backorder-card.scss',
})
export class OrderBackorderCard {
  readonly backorder = input.required<AdminBackorderView | null>();

  /** L'abandon a abouti : au parent de relire la fiche. */
  readonly changed = output<void>();

  private readonly api = inject(AdminBackordersService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly open = computed(() => this.backorder()?.state === 'open');
  /** Transformer : un pro, et le droit de passer une commande pour lui. */
  protected readonly canConvert = computed(
    () =>
      this.open() &&
      this.backorder()?.company !== null &&
      this.permissions.can('b2b_place_order:write'),
  );
  protected readonly canAbandon = computed(
    () => this.open() && this.permissions.can('b2b_orders_shortfall:write'),
  );
  /** La saisie garnie du reliquat, ouverte depuis la commande d'origine. */
  protected readonly convertLink = computed(() => {
    const backorder = this.backorder();
    return backorder === null ? null : ['/commandes', backorder.origin.orderId, 'reliquat'];
  });

  protected readonly saving = signal(false);
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async abandon(): Promise<void> {
    const backorder = this.backorder();
    if (backorder === null) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.abandon(backorder.id);
      this.confirming.set(false);
      this.changed.emit();
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "Le reliquat n'a pas pu être abandonné. Réessayez."));
    } finally {
      this.saving.set(false);
    }
  }
}
