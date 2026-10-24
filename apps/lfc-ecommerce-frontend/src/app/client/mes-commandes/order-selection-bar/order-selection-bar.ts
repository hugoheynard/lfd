import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ORDER_SUMMARY_MAX_ORDERS } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { selectedLabel } from '../order-summary-format';

/**
 * La barre de la sélection, dans l'en-tête de l'historique : « N
 * sélectionnées », le plafond, et le bouton « Récapitulatif » (plan
 * `documentation/commandes/boutique/plan-recapitulatif-des-commandes.md`, §6.5, lot R3).
 *
 * Le plafond est dit AVANT d'envoyer : la case d'en-tête coche tout ce qui
 * est affiché, et une liste longue le dépasse d'un clic. Au-delà, le bouton se
 * grise et la barre dit combien retirer — le serveur refuserait de toute façon,
 * mais un refus après coup apprend moins qu'une consigne sous les yeux.
 */
@Component({
  selector: 'app-order-selection-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './order-selection-bar.html',
  styleUrl: './order-selection-bar.scss',
})
export class OrderSelectionBar {
  /** Le nombre de commandes cochées ET affichées. */
  readonly count = input.required<number>();

  readonly summarize = output<void>();

  private readonly t = inject(ClientCopyService).t;
  protected readonly copy = computed(() => this.t().orders.summary);

  protected readonly label = computed(() => selectedLabel(this.count(), this.copy()));

  protected readonly over = computed(() => this.count() > ORDER_SUMMARY_MAX_ORDERS);

  protected readonly capHint = computed(() =>
    fill(this.copy().capHint, { max: String(ORDER_SUMMARY_MAX_ORDERS) }),
  );

  protected readonly capExceeded = computed(() =>
    fill(this.copy().capExceeded, {
      max: String(ORDER_SUMMARY_MAX_ORDERS),
      extra: String(this.count() - ORDER_SUMMARY_MAX_ORDERS),
    }),
  );
}
