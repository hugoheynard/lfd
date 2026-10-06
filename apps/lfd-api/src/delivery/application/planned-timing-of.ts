import { addDays, addMinutes, localToInstant } from "@lfd/contracts";

import type { TimedRoute } from "../domain/services/route-timing.js";
import { clockTimeOf } from "../domain/value-objects/clock-time.js";
import { PlannedTiming } from "../domain/value-objects/planned-timing.js";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_DAY = 24 * 60;

/**
 * L'INSTANT d'une heure du calcul de tournée — des secondes depuis minuit,
 * heure de Paris, le jour de service ; au-delà de minuit, le lendemain. Une
 * heure qui n'existe pas (le passage à l'heure d'été) se compte depuis minuit.
 * `null` : le jour n'est pas lisible.
 */
export function parisInstantOf(day: string, seconds: number): Date | null {
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  const local = addDays(day, Math.floor(minutes / MINUTES_PER_DAY));
  const exact = localToInstant(local, clockTimeOf(minutes));
  if (exact !== null) {
    return exact;
  }
  const midnight = localToInstant(day, "00:00");
  return midnight === null ? null : addMinutes(midnight, minutes);
}

/** L'horaire prévu d'une tournée chronométrée ; `null` si un instant ne se lit pas. */
export function plannedTimingOf(day: string, timed: TimedRoute): PlannedTiming | null {
  const departureAt = parisInstantOf(day, timed.departure);
  const returnAt = parisInstantOf(day, timed.return);
  if (departureAt === null || returnAt === null) {
    return null;
  }
  return PlannedTiming.of({ departureAt, returnAt, meters: Math.round(timed.meters) });
}
