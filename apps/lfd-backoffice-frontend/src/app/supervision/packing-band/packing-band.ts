import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { SitePaletteEntryView } from '@lfd/contracts';
import { FoldMultiselectComponent } from 'fold-ng';

import { fulfillmentModeOf } from '../../shared/logistics-colors/fulfillment-mode';
import { LogisticsSwatch } from '../../shared/logistics-colors/logistics-swatch/logistics-swatch';
import type { PackingBoard, PackingCard } from '../packing-cards';
import { routeOptions } from '../route-filter';

/**
 * **La bande de la colonne 2** (Supervision v2, A4) : le repère « Par heure
 * de remise » et le filtre d'acheminement. Elle vit sous l'en-tête de
 * colonne, hors du corps qui défile — d'où un composant à part, projeté par la
 * page dans le slot `columnBand`, qui partage son filtre avec la colonne.
 *
 * Le filtre est une multi-sélection depuis le 2026-11-01 (Hugo) : « Retrait
 * <site> », « Livraison », plusieurs à la fois, chaque option dans le rendu
 * du badge que porte la carte ; rien de coché = tout.
 */
@Component({
  selector: 'app-packing-band',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldMultiselectComponent, LogisticsSwatch],
  templateUrl: './packing-band.html',
  styleUrl: './packing-band.scss',
})
export class PackingBand {
  readonly board = input.required<PackingBoard>();
  /** La palette des sites — la couleur des options ; vide : teinte neutre. */
  readonly palette = input<readonly SitePaletteEntryView[]>([]);
  /** Les acheminements cochés — `[(routes)]`, partagés avec `app-packing-column` ; vide = tous. */
  readonly routes = model<readonly string[]>([]);

  protected readonly options = computed(() =>
    routeOptions([...this.board().visible, ...this.board().packed], (card: PackingCard) =>
      fulfillmentModeOf({ ...card, fulfillmentMethod: card.method }, this.palette()),
    ),
  );
  /** L'option par sa valeur : le gabarit d'option ne reçoit que `{ value, label }`. */
  protected readonly byValue = computed(
    () => new Map(this.options().map((option) => [option.value, option])),
  );
  protected readonly active = computed(() => this.routes().length > 0);
}
