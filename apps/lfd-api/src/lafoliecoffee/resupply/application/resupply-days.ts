import { addDays, instantToLocal } from "@lfd/contracts";

/** Aujourd'hui et demain à l'heure de Paris, lus du `Clock` — jamais du poste. */
export function resupplyDays(now: Date): { readonly today: string; readonly tomorrow: string } {
  const today = instantToLocal(now).day;
  return { today, tomorrow: addDays(today, 1) };
}
