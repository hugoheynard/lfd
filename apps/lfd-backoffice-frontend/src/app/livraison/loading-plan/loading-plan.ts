import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DeliveryLoadingPlanView, DeliveryLoadingRoundView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldMeterComponent,
} from 'fold-ng';

import { loadedStackIndexes } from '../delivery-loading-floor';
import {
  currentStep,
  isStepLoaded,
  loadedBinKeys,
  planBinKey,
  planBinLabel,
  stackStopsLabel,
  stackTitle,
  stepHeadline,
  volumeGauges,
} from '../delivery-loading-plan';
import { LoadingFloor } from '../loading-floor/loading-floor';

/**
 * **Le plan de chargement d'une tournée** (`plan-preparation-de-tournee.md`,
 * lot 4 bis, L4b-C7, v2-5) : l'ordre SUGGÉRÉ, les piles et leur place sur le
 * plancher vu de dessus (G5) quand le véhicule a ses dimensions, le volume sec
 * et froid, et les alertes du serveur telles quelles.
 *
 * Le détail du dépôt, sous l'écran « Charger » : le plan est lu par
 * l'écran (`loading-round`), qui en tire aussi la carte, la rangée et les
 * alertes — celles-ci ne se répètent pas ici. Ce qui est déjà chargé se
 * croise avec la vue du chargement, que la page relit après chaque geste.
 */
@Component({
  selector: 'app-loading-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldMeterComponent,
    LoadingFloor,
  ],
  templateUrl: './loading-plan.html',
  styleUrl: './loading-plan.scss',
})
export class LoadingPlan {
  readonly plan = input.required<DeliveryLoadingPlanView>();
  /** La vue du chargement : ses bacs déjà chargés. */
  readonly round = input.required<DeliveryLoadingRoundView>();

  protected readonly loaded = computed(() => loadedBinKeys(this.round()));

  protected readonly loadedStacks = computed(() => {
    return loadedStackIndexes(this.plan().order, this.loaded());
  });

  protected readonly current = computed(() => currentStep(this.plan().order, this.loaded()));

  protected readonly gauges = computed(() => volumeGauges(this.plan().volume));

  protected readonly headline = stepHeadline;
  protected readonly binLabel = planBinLabel;
  protected readonly binKey = planBinKey;
  protected readonly stackTitle = stackTitle;
  protected readonly stackStops = stackStopsLabel;
  protected readonly stepLoaded = isStepLoaded;
}
