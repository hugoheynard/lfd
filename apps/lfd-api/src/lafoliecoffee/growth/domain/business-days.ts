import { addDays, instantToLocal, weekdayOf } from "@lfd/contracts";

/** Dimanche et samedi, au sens de `weekdayOf` (0 = dimanche). */
const WEEKEND_DAYS: ReadonlySet<number> = new Set([0, 6]);

/**
 * **Les jours ouvrés écoulés** entre deux instants, au calendrier de Paris :
 * les jours du lundi au vendredi APRÈS le jour de `from`, jusqu'au jour de
 * `to` compris. Une inscription du vendredi soir a donc un jour ouvré écoulé
 * le lundi, deux le mardi. Les jours fériés ne sont pas retirés — le seuil
 * reste une alerte, pas un délai légal. Pur.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  const last = instantToLocal(to).day;
  let day = instantToLocal(from).day;
  let count = 0;
  while (day < last) {
    day = addDays(day, 1);
    if (!WEEKEND_DAYS.has(weekdayOf(day))) {
      count += 1;
    }
  }
  return count;
}
