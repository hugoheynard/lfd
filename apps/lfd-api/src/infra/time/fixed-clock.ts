import type { Instant } from "../context/request-context.js";
import { Clock } from "./clock.js";

/**
 * `Clock` **déterministe** : rend toujours l'instant qu'on lui a fixé.
 *
 * Usage premier = les tests (momentum, cohortes, activation… testables sans
 * horloge murale), mais c'est un vrai adaptateur : il servirait aussi à rejouer
 * un flux d'événements à un instant donné.
 */
export class FixedClock extends Clock {
  private current: Instant;

  constructor(initial: Instant) {
    super();
    this.current = initial;
  }

  now(): Instant {
    return this.current;
  }

  /** Repositionne l'horloge sur un instant précis. */
  set(instant: Instant): void {
    this.current = instant;
  }

  /** Avance l'horloge de `ms` millisecondes (utile pour simuler une fenêtre). */
  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
