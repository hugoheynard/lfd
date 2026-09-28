import { DayVersionWatcher } from '../shared/day-version/day-version-watcher';
import { refreshWhileVisible } from '../shared/periodic-refresh';
import { inject } from '@angular/core';

/** Le jour relu quoi qu'il arrive (D5) : deux opérations par minute. */
export const DAY_REFRESH_MS = 60_000;

/**
 * **Les deux rythmes de la Supervision** (`plan-version-par-journee.md`) :
 *
 * - les colonnes ne se relisent que si l'un des deux journaux du jour affiché a
 *   bougé (D4) — commerce et fournil, chacun par sa porte `b2b_supervision` ;
 * - le jour, lui, toutes les minutes : « créneau dépassé » change à l'heure,
 *   sans que rien ne soit écrit (D5).
 *
 * `on-turn` relit le jour seul, et les colonnes si minuit l'a fait tourner.
 *
 * ⚠️ Dans un contexte d'injection (le constructeur de l'écran).
 */
export function watchSupervisionDay(
  date: () => string | null,
  refresh: (columns: 'always' | 'on-turn') => Promise<void>,
): void {
  inject(DayVersionWatcher).watch({
    journals: ['commerce', 'supervision-production'],
    date,
    reload: () => refresh('always'),
  });
  refreshWhileVisible(() => refresh('on-turn'), DAY_REFRESH_MS);
}
