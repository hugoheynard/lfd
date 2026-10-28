import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

/** Une seconde : l'horloge du bandeau les montre ; le retard, lui, se dit à la minute. */
const TICK_MS = 1_000;

/** Les secondes écoulées depuis minuit, à l'heure du poste. */
function secondsNow(): number {
  const at = new Date();
  return at.getHours() * 3600 + at.getMinutes() * 60 + at.getSeconds();
}

/**
 * **L'horloge de la fiche** — « maintenant », mis à jour chaque seconde (plan
 * `documentation/fournil/plan-fournee-v3.md` §2), lu par l'horloge du bandeau.
 * `minutes` ne change qu'à la minute : un retard ne se recalcule pas à chaque
 * seconde (un signal égal ne relance rien).
 *
 * Fournie par la fiche, et doublée dans les tests : aucun gabarit ne lit
 * `new Date()` au rendu, et un retard se teste à heure fixe.
 */
@Injectable()
export class WorkshopClock {
  private readonly current = signal(secondsNow());
  readonly seconds = this.current.asReadonly();
  readonly minutes = computed(() => Math.floor(this.current() / 60));

  constructor() {
    const timer = setInterval(() => this.current.set(secondsNow()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
