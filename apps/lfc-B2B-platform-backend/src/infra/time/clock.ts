import type { Instant } from "../context/request-context.js";

/**
 * Port **Clock** — la seule source de temps du domaine et de l'application.
 *
 * Le domaine dépend de cette **abstraction** (DIP), jamais de `new Date()` /
 * `Date.now()` : ceux-là sont réservés aux adaptateurs (`SystemClock`,
 * `FixedClock`). En test, `FixedClock` gèle le temps → momentum, cohortes,
 * `activatedAt`, `occurredAt` deviennent **déterministes**.
 */
export abstract class Clock {
  /** L'instant « maintenant » — gelé pour toute la durée d'une requête. */
  abstract now(): Instant;
}
