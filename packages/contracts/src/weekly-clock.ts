import type { Weekday } from "./address.js";
import { weekdayOfDate } from "./order-cutoff.js";
import { instantToLocal, minutesOfDay, type LocalMoment } from "./paris-time.js";

/**
 * **L'heure murale de la semaine, à Paris** — le seul juge de « tel jour, de
 * telle heure à telle heure », partagé par les suggestions (RS8) et les
 * promotions à jours et heures (`documentation/promotions/plan-jours-et-heures.md`,
 * § 8 « un seul évaluateur de Paris »).
 *
 * Extrait de `suggestion-conditions-gate.ts` le 2026-10-31 plutôt que réécrit :
 * deux lectures de « est-ce dans la plage ? » finiraient par diverger sur la
 * borne de fin ou sur une bascule d'heure, et l'écart ne se verrait qu'un
 * dimanche par an.
 *
 * L'heure est MURALE : la lecture passe par `instantToLocal`, donc une plage
 * de 2 h à 3 h n'existe pas le dernier dimanche de mars, et vaut deux fois le
 * dernier dimanche d'octobre — ce que lit la pendule de la boutique.
 */

/** Une plage d'heures locales : début compris, fin exclue, sans passer minuit. */
export interface ClockRange {
  /** `HH:MM`. */
  readonly start: string;
  /** `HH:MM`, après `start`. */
  readonly end: string;
}

/** Un instant lu à la pendule de Paris : le jour de la semaine et l'heure. */
export interface WeeklyMoment {
  readonly weekday: Weekday;
  /** `HH:MM`. */
  readonly time: string;
}

/** L'heure `HH:MM` est-elle dans la plage — début compris, fin exclue ? */
export function clockRangeCovers(range: ClockRange, time: string): boolean {
  const minute = minutesOfDay(time);
  return minutesOfDay(range.start) <= minute && minute < minutesOfDay(range.end);
}

/** Une lecture locale (jour + heure) en jour de la semaine + heure. */
export function weeklyMomentOfLocal(local: LocalMoment): WeeklyMoment {
  return { weekday: weekdayOfDate(local.day), time: local.time };
}

/** Un instant, lu à la pendule de Paris. */
export function weeklyMomentOf(instant: Date): WeeklyMoment {
  return weeklyMomentOfLocal(instantToLocal(instant));
}
