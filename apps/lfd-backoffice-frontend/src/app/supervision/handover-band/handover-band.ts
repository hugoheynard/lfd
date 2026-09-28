import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { FulfillmentMethod } from '@lfd/contracts';
import { FoldListboxComponent, FoldTabsComponent } from 'fold-ng';
import type { FoldSelectOption, FoldTabItem } from 'fold-ng';

import { ALL_POINTS, pickupPoints, totalOf } from '../handover-layout';
import type { HandoverBoard } from '../handover-slots';

/**
 * **La bande de la colonne 3** (Supervision v2, A4) : Retrait et Livraison en
 * onglets, et — sur le Retrait seulement — le filtre par point de retrait.
 * Posée par la page dans le slot `columnBand` ; l'acheminement et le point
 * sont des `model()` que la page relie aussi à `app-handover-column`.
 */
@Component({
  selector: 'app-handover-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldListboxComponent, FoldTabsComponent],
  templateUrl: './handover-band.html',
  styleUrl: './handover-band.scss',
})
export class HandoverBand {
  readonly board = input.required<HandoverBoard>();
  readonly method = model<FulfillmentMethod>('pickup');
  /** `ALL_POINTS` = tous les points. */
  readonly point = model<string>(ALL_POINTS);

  protected readonly allPoints = ALL_POINTS;

  protected readonly tabs = computed<readonly FoldTabItem<FulfillmentMethod>[]>(() => [
    { key: 'pickup', label: 'Retrait', badge: totalOf(this.board().pickup) },
    { key: 'delivery', label: 'Livraison', badge: totalOf(this.board().delivery) },
  ]);

  protected readonly pointOptions = computed<readonly FoldSelectOption<string>[]>(() => [
    { value: ALL_POINTS, label: `Tous les points · ${String(totalOf(this.board().pickup))}` },
    ...pickupPoints(this.board().pickup).map(({ label, count }) => ({
      value: label,
      label: `${label} · ${String(count)}`,
    })),
  ]);
}
