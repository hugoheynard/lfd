import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { FulfillmentMethod, SitePaletteEntryView } from '@lfd/contracts';
import { FoldMultiselectComponent, FoldTabsComponent } from 'fold-ng';
import type { FoldTabItem } from 'fold-ng';

import { fulfillmentModeOf } from '../../shared/logistics-colors/fulfillment-mode';
import { LogisticsSwatch } from '../../shared/logistics-colors/logistics-swatch/logistics-swatch';
import { liveRows, totalOf } from '../handover-layout';
import type { HandoverBoard, SlotRow } from '../handover-slots';
import { routeOptions } from '../route-filter';

/**
 * **La bande de la colonne 3** (Supervision v2, A4) : Retrait et Livraison en
 * onglets, et — sur le Retrait seulement — le filtre d'acheminement, en
 * multi-sélection depuis le 2026-11-01 comme la colonne Colisage : un
 * « Retrait <site> » par point, plusieurs à la fois, rien de coché = tout.
 * La Livraison a son onglet : elle n'est pas une option ici.
 *
 * Posée par la page dans le slot `columnBand` ; l'acheminement et les points
 * cochés sont des `model()` que la page relie aussi à `app-handover-column`.
 */
@Component({
  selector: 'app-handover-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldMultiselectComponent, FoldTabsComponent, LogisticsSwatch],
  templateUrl: './handover-band.html',
  styleUrl: './handover-band.scss',
})
export class HandoverBand {
  readonly board = input.required<HandoverBoard>();
  /** La palette des sites — la couleur des options ; vide : teinte neutre. */
  readonly palette = input<readonly SitePaletteEntryView[]>([]);
  readonly method = model<FulfillmentMethod>('pickup');
  /** Les retraits cochés ; vide = tous. */
  readonly routes = model<readonly string[]>([]);

  protected readonly tabs = computed<readonly FoldTabItem<FulfillmentMethod>[]>(() => [
    { key: 'pickup', label: 'Retrait', badge: totalOf(this.board().pickup) },
    { key: 'delivery', label: 'Livraison', badge: totalOf(this.board().delivery) },
  ]);

  protected readonly options = computed(() =>
    routeOptions(liveRows(this.board().pickup), (row: SlotRow) =>
      fulfillmentModeOf({ ...row, fulfillmentMethod: row.method }, this.palette()),
    ),
  );
  /** L'option par sa valeur : le gabarit d'option ne reçoit que `{ value, label }`. */
  protected readonly byValue = computed(
    () => new Map(this.options().map((option) => [option.value, option])),
  );
}
