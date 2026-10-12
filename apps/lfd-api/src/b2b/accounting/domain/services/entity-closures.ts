import type { BillingCycle } from "./billing-cycle.js";
import { closureAfter, previousClosureOf, type RhythmTimeline } from "./invoicing-closures.js";

/**
 * **Le cycle de prélèvement suit les clôtures du rythme de l'ENTITÉ** (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`,
 * §10, lot R4) : `cycleAt`, `cycleToConstitute` et `isCalendarClosure`
 * généralisés du « 1er à 00h00 » à la suite de clôtures réglée sur l'entité.
 *
 * Le mensuel au 1er rend EXACTEMENT les fonctions calendaires de
 * `billing-cycle.ts` — prouvé par égalité dans `entity-closures.spec.ts`.
 *
 * Pur : l'instant, le rythme et la dernière clôture enregistrée sont donnés.
 */

/**
 * La dernière clôture de l'entité atteinte à `now` (≤ `now`, incluse à
 * l'instant exact) — sous le rythme qui faisait foi, bascule comprise.
 */
export function lastClosureAtOrBefore(now: Date, timeline: RhythmTimeline): Date {
  return previousClosureOf(closureAfter(now, timeline), timeline);
}

/**
 * **Le cycle qui contient `now`** — `cycleAt` au rythme de l'entité. Sa borne
 * basse est la clôture ENREGISTRÉE si elle précède la clôture à venir, sinon
 * la clôture réelle qui précède.
 */
export function entityCycleAt(
  now: Date,
  timeline: RhythmTimeline,
  previousClosure: Date | null,
): BillingCycle {
  const closesAt = closureAfter(now, timeline);
  return { startsAt: lowerBound(closesAt, timeline, previousClosure), closesAt };
}

/**
 * **Le cycle qu'on constitue** à `now` — `cycleToConstitute` au rythme de
 * l'entité : clos à la dernière clôture atteinte, ouvert à la dernière
 * clôture enregistrée avant elle, ou à la clôture réelle qui la précède.
 * Toujours clos par construction.
 */
export function entityCycleToConstitute(
  now: Date,
  timeline: RhythmTimeline,
  previousClosure: Date | null,
): BillingCycle {
  const closesAt = lastClosureAtOrBefore(now, timeline);
  return { startsAt: lowerBound(closesAt, timeline, previousClosure), closesAt };
}

/**
 * Cet instant est-il une clôture de l'entité ? — `isCalendarClosure` au
 * rythme : la première clôture d'un lot doit en être une, pour que le lot
 * ferme la même période que la facture qu'il encaisse.
 */
export function isEntityClosure(instant: Date, timeline: RhythmTimeline): boolean {
  return (
    closureAfter(previousClosureOf(instant, timeline), timeline).getTime() === instant.getTime()
  );
}

/** Les `count` prochaines clôtures de l'entité, strictement après `now`. */
export function upcomingClosures(
  now: Date,
  timeline: RhythmTimeline,
  count: number,
): readonly Date[] {
  const closures: Date[] = [];
  let cursor = now;
  while (closures.length < count) {
    cursor = closureAfter(cursor, timeline);
    closures.push(cursor);
  }
  return closures;
}

function lowerBound(closesAt: Date, timeline: RhythmTimeline, previousClosure: Date | null): Date {
  return previousClosure !== null && previousClosure < closesAt
    ? previousClosure
    : previousClosureOf(closesAt, timeline);
}
