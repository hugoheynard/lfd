import { addDays } from "@lfd/contracts";

/**
 * « Contrôles tenus » : chaque jour attesté, sur une plage qui couvre toutes
 * les fixtures de la procédure. Le défaut des lots de test — un lot dont la
 * fenêtre n'a PAS été attestée se l'écrit explicitement.
 */
export const EVERY_DAY_CHECKED: ReadonlySet<string> = (() => {
  const days = new Set<string>();
  for (let day = "2025-01-01"; day <= "2028-12-31"; day = addDays(day, 1)) {
    days.add(day);
  }
  return days;
})();

/** Aucun jour attesté. */
export const NO_DAY_CHECKED: ReadonlySet<string> = new Set();
