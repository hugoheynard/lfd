import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldViewToggleComponent } from 'fold-ng';

import { STATS_GRAIN_OPTIONS } from '../stats-grain';
import { StatsGrainStore } from '../stats-grain.store';

/**
 * Le **sélecteur de temporalité** — un seul pour tout le back-office.
 *
 * Il n'a pas d'entrée ni de sortie : il lit et écrit directement le réglage
 * partagé ({@link StatsGrainStore}). Le faire piloter par un `model()` aurait
 * obligé chaque page à recopier la même liaison, et ouvert la porte à deux
 * écrans qui se contredisent.
 *
 * Un segmenté et non une liste déroulante : cinq choix, toujours les mêmes, et
 * on en change souvent — le coût d'un aller-retour dans un menu se paierait à
 * chaque question.
 */
@Component({
  selector: 'app-stats-grain',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldViewToggleComponent],
  templateUrl: './stats-grain-toggle.html',
  styleUrl: './stats-grain-toggle.scss',
})
export class StatsGrainToggle {
  private readonly store = inject(StatsGrainStore);

  protected readonly options = STATS_GRAIN_OPTIONS;
  protected readonly grain = this.store.grain;

  protected pick(value: string): void {
    this.store.set(value);
  }
}
