import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OrderClientele } from '@lfd/contracts';
import { FoldBadgeComponent } from 'fold-ng';

import type { LogisticsCategory } from '../../logistics-colors/logistics-category';
import { LogisticsSwatch } from '../../logistics-colors/logistics-swatch/logistics-swatch';
import { clienteleBadgeOf } from '../order-identity';

/**
 * **Qui commande, et par où ça part** — le badge Pro / Particulier et le mode
 * à la couleur du site (« Livraison », « Retrait Adroit »), côte à côte sur
 * une carte de la Supervision (Hugo, 2026-11-01).
 *
 * Le badge est absent quand la commande ne sait pas sa clientèle : rien n'est
 * déduit après coup.
 */
@Component({
  selector: 'app-order-tags',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, LogisticsSwatch],
  templateUrl: './order-tags.html',
  styleUrl: './order-tags.scss',
})
export class OrderTags {
  readonly clientele = input<OrderClientele | null | undefined>(null);
  readonly mode = input.required<LogisticsCategory>();

  protected readonly badge = computed(() => clienteleBadgeOf(this.clientele()));
}
