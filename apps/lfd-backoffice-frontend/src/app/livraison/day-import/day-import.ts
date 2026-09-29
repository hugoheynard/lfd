import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { DeliverySimulationFromDayView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldInlineConfirmComponent,
} from 'fold-ng';

import { serviceDayLabel } from '../delivery-rounds';
import { DeliverySimulationScenariosService } from '../delivery-simulation-scenarios.service';
import { parisDayOf } from '../run-sheet';

/**
 * **Partir d'une vraie journée** (`plan-preparation-de-tournee.md`, lot 9,
 * L9-C8) : les livraisons du jour COPIÉES en arrêts inventés — aucun lien
 * vers les commandes. Remplacer un scénario modifié se confirme ; les
 * livraisons sans point sont listées à part, non chargées.
 */
@Component({
  selector: 'app-day-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldInlineConfirmComponent,
  ],
  templateUrl: './day-import.html',
  styleUrl: './day-import.scss',
})
export class DayImport {
  private readonly scenarios = inject(DeliverySimulationScenariosService);

  /** Le scénario à l'écran a-t-il des changements qu'on perdrait ? */
  readonly modified = input(false);

  readonly loaded = output<DeliverySimulationFromDayView>();

  protected readonly day = signal(parisDayOf(new Date()));
  protected readonly loading = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly withoutPoint = signal<DeliverySimulationFromDayView['withoutPoint']>([]);

  protected readonly buttonLabel = computed(() =>
    this.day() === ''
      ? 'Partir d’une journée'
      : `Partir de la journée du ${serviceDayLabel(this.day())}`,
  );

  protected async load(): Promise<void> {
    const day = this.day();
    if (day === '' || this.loading()) {
      return;
    }
    this.loading.set(true);
    this.refusal.set(null);
    try {
      const view = await this.scenarios.fromDay(day);
      this.withoutPoint.set(view.withoutPoint);
      this.loaded.emit(view);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Cette journée n’a pas pu être lue.'));
    } finally {
      this.loading.set(false);
    }
  }
}
