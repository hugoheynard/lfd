import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type {
  DeliveryRoutingSettingsPayload,
  DeliverySimulationView,
  SimulatedRoundView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import {
  distanceLabel,
  durationLabel,
  estimateLabel,
  proposalWindowLabel,
} from '../delivery-routing';
import { timeLabel } from '../run-sheet';

/**
 * **La proposition simulée** (`plan-preparation-de-tournee.md`, lot 9,
 * L9-C6) — la sœur de l'aperçu du calculateur (`route-planner`), au format du
 * lot 7. Une sœur et non une extraction : l'aperçu du lot 7 est tissé de
 * commandes (références, liens, non-situées, tournées gardées, « Appliquer »),
 * qu'une simulation n'a pas.
 */
@Component({
  selector: 'app-simulation-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldCalloutComponent, FoldCardComponent, FoldElementTitleComponent],
  templateUrl: './simulation-result.html',
  styleUrl: './simulation-result.scss',
})
export class SimulationResult {
  readonly view = input.required<DeliverySimulationView>();
  /** Les réglages envoyés : l'estimation à vol d'oiseau les cite. */
  readonly settings = input.required<DeliveryRoutingSettingsPayload>();

  protected readonly estimate = computed(() =>
    estimateLabel({ estimate: this.view().estimate, settings: this.settings() }),
  );

  protected readonly timeLabel = timeLabel;
  protected readonly windowLabel = proposalWindowLabel;

  /** « Camionnette », « Camionnette · passage 2 ». */
  protected roundTitle(round: SimulatedRoundView): string {
    return round.passage > 1
      ? `${round.vehicleName} · passage ${String(round.passage)}`
      : round.vehicleName;
  }

  /** « Départ 7 h 00 · retour 9 h 10 · 42,0 km · 2 h 10 ». */
  protected roundSummary(round: SimulatedRoundView): string {
    return [
      `Départ ${timeLabel(round.departureTime)}`,
      `retour ${timeLabel(round.returnTime)}`,
      distanceLabel(round.meters),
      durationLabel(round.minutes),
    ].join(' · ');
  }
}
