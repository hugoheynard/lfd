import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { WorkshopClock } from '../workshop-clock';

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * **L'horloge du bandeau** — « 7:56 » en gros, les secondes en petit (maquette
 * v3, Hugo 2026-10-28) : au four, on compare la tranche à l'heure d'un coup
 * d'œil, sans chercher celle du téléphone.
 */
@Component({
  selector: 'app-workshop-wall-clock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workshop-wall-clock.html',
  styleUrl: './workshop-wall-clock.scss',
})
export class WorkshopWallClock {
  private readonly clock = inject(WorkshopClock);

  protected readonly hoursMinutes = computed(() => {
    const total = this.clock.seconds();
    return `${String(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}`;
  });
  protected readonly secondsLabel = computed(() => pad(this.clock.seconds() % 60));
}
