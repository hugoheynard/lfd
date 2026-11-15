import { addDays, instantToLocal } from "@lfd/contracts";

/**
 * **Aujourd'hui et demain, à l'heure de la maison.**
 *
 * Sorti de `production-packing.ts` le 2026-09-14 : le poste de colisage et la
 * fiche d'atelier posent la même question à la même horloge, et deux lectures
 * du jour de Paris finiraient par ne pas tomber d'accord à minuit.
 */

/** La journée lue relativement à aujourd'hui. `null` = ni l'un ni l'autre. */
export type RelativeDay = "today" | "tomorrow" | null;

/**
 * Le jour de Paris d'un instant, au format `AAAA-MM-JJ`.
 *
 * Le jour se lit à l'heure de la maison (`instantToLocal`, `Europe/Paris`), et
 * surtout pas en UTC : à 00 h 30 à Paris l'été, il est 22 h 30 UTC la VEILLE, et
 * un `toISOString().slice(0, 10)` dirait « demain » d'une journée qui a déjà
 * commencé au fournil. Même lecture que `billing-cycle` et `pain008`
 * (vérifié le 2026-09-14).
 */
export function todayOf(now: Date): string {
  return instantToLocal(now).day;
}

/** Le lendemain du jour de Paris — même lecture que {@link todayOf}. */
export function tomorrowOf(now: Date): string {
  return addDays(todayOf(now), 1);
}

/**
 * La journée lue, **relativement à aujourd'hui à Paris**.
 *
 * Aucune conversion jour → instant ici : on compare deux jours `AAAA-MM-JJ`
 * entre eux, ce que le tri lexicographique d'un jour ISO permet sans fuseau.
 */
export function relativeDayOf(serviceDay: string, now: Date): RelativeDay {
  if (serviceDay === todayOf(now)) {
    return "today";
  }
  return serviceDay === tomorrowOf(now) ? "tomorrow" : null;
}
