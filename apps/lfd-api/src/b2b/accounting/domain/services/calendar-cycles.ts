import type { BillingCycle } from "./billing-cycle.js";

/**
 * Une suite de clôtures lue comme un calendrier : ce que le lot, son
 * automatisme et la fiche demandent au calendrier de la facture
 * (`InvoicingCalendar`, plan `plan-rythme-de-facturation.md`, §16.3, lot M3).
 *
 * Ce n'est pas une `RhythmTimeline` : deux payeurs peuvent clore le même jour
 * ou des jours différents, le calendrier ne rend que des instants.
 */
export interface ClosureSequence {
  /** La prochaine clôture, strictement après `instant`. */
  closureAfter(instant: Date): Date;
  /** La dernière clôture strictement avant `instant`. */
  closureBefore(instant: Date): Date;
  /** La dernière clôture atteinte à `now` (≤ `now`). */
  lastClosureAtOrBefore(now: Date): Date;
  /** Cet instant est-il une clôture ? */
  isClosure(instant: Date): boolean;
}

/**
 * **Le cycle du lot qui contient `now`** — `entityCycleAt` sur le calendrier :
 * clos à la prochaine clôture, ouvert à la clôture ENREGISTRÉE si elle la
 * précède, sinon à la clôture du calendrier qui précède.
 */
export function calendarCycleAt(
  now: Date,
  calendar: ClosureSequence,
  previousClosure: Date | null,
): BillingCycle {
  const closesAt = calendar.closureAfter(now);
  return { startsAt: lowerBound(closesAt, calendar, previousClosure), closesAt };
}

/**
 * **Le cycle du lot qu'on constitue** à `now` — `entityCycleToConstitute` sur
 * le calendrier : clos à la dernière clôture atteinte, la précédente pour
 * borne. Toujours clos par construction.
 */
export function calendarCycleToConstitute(
  now: Date,
  calendar: ClosureSequence,
  previousClosure: Date | null,
): BillingCycle {
  const closesAt = calendar.lastClosureAtOrBefore(now);
  return { startsAt: lowerBound(closesAt, calendar, previousClosure), closesAt };
}

function lowerBound(closesAt: Date, calendar: ClosureSequence, previousClosure: Date | null): Date {
  return previousClosure !== null && previousClosure < closesAt
    ? previousClosure
    : calendar.closureBefore(closesAt);
}
