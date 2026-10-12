import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldBadgeComponent, FoldElementTitleComponent } from 'fold-ng';

import type { OrderHeader } from '../order-header';

/**
 * **L'en-tête du détail d'une commande** — la référence, puis, en tête de la
 * ligne suivante, le badge Pro / Particulier devant le mode, le jour et le
 * client.
 *
 * Le badge vivait dans `[titleAction]`, le seul créneau de `fold-element-title`
 * (vérifié dans `fold-ng.d.ts` le 2026-10-12) : rejeté au bord droit, il passait
 * inaperçu (Hugo, 2026-10-12). Il ouvre désormais la lecture.
 */
@Component({
  selector: 'app-order-detail-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldElementTitleComponent],
  templateUrl: './order-detail-header.html',
  styleUrl: './order-detail-header.scss',
})
export class OrderDetailHeaderComponent {
  readonly header = input.required<OrderHeader>();
}
