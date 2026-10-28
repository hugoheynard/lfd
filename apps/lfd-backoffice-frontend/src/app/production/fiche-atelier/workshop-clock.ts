import { DestroyRef, inject, Injectable, signal } from '@angular/core';

/** Une minute : le retard se dit à la minute, pas à la seconde. */
const TICK_MS = 60_000;

/** Les minutes écoulées depuis minuit, à l'heure du poste. */
function minutesNow(): number {
  const at = new Date();
  return at.getHours() * 60 + at.getMinutes();
}

/**
 * **L'horloge de la fiche** — « maintenant », en minutes depuis minuit, mis à
 * jour chaque minute (plan `documentation/fournil/plan-fournee-v3.md` §2).
 *
 * Fournie par la fiche, et doublée dans les tests : aucun gabarit ne lit
 * `new Date()` au rendu, et un retard se teste à heure fixe.
 */
@Injectable()
export class WorkshopClock {
  private readonly current = signal(minutesNow());
  readonly minutes = this.current.asReadonly();

  constructor() {
    const timer = setInterval(() => this.current.set(minutesNow()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
