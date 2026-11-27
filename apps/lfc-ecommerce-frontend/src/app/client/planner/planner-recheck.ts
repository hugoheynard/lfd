import { DestroyRef, effect, untracked } from '@angular/core';

import type { PlannerBoard } from './planner-board.store';
import { nearestClose } from './planner-grid';

/** Le plus long qu'on attende avant de relire la vérification : un jour. */
const MAX_RECHECK_MS = 86_400_000;

/**
 * **Relit la vérification à l'instant du plus proche `closesAt` affiché**
 * (plan `planificateur/plan-planificateur-de-commandes.md`, § 4 bis) : ce qui
 * bloque change avec l'heure — une limite qui passe pendant que l'écran est
 * ouvert —, sans sondage permanent. À appeler dans un contexte d'injection,
 * dans le navigateur seulement.
 */
export function recheckAtNearestClose(board: PlannerBoard, destroyRef: DestroyRef): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  effect(() => {
    const at = nearestClose(
      board.checks(),
      untracked(() => new Date()),
    );
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (at === null) {
      return;
    }
    const delay = Math.min(at.getTime() - Date.now(), MAX_RECHECK_MS);
    timer = setTimeout(() => {
      void board.load(untracked(() => board.from()));
    }, delay);
  });
  destroyRef.onDestroy(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}
