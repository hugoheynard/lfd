import { addDays, instantToLocal } from "@lfd/contracts";

/**
 * **Aujourd'hui et demain, à l'heure de la maison** — pour le poste servi par
 * le colisage (K3a).
 *
 * Recopié de `production/domain/services/relative-day.ts` et non importé : le
 * colisage n'atteint le fournil que par son canal. La même lecture du jour de
 * Paris (`instantToLocal`) ; les deux bougent ensemble tant que les deux
 * postes sont servis (le fournil retire le sien en K3c).
 */
export type RelativeDay = "today" | "tomorrow" | null;

/** La journée lue relativement à aujourd'hui à Paris. `null` = ni l'un ni l'autre. */
export function relativeDayOf(serviceDay: string, now: Date): RelativeDay {
  const today = instantToLocal(now).day;
  if (serviceDay === today) {
    return "today";
  }
  return serviceDay === addDays(today, 1) ? "tomorrow" : null;
}
