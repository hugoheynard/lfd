import { addDays, instantToLocal, localToInstant } from "@lfd/contracts";

import { relativeDayOf, todayOf, tomorrowOf } from "../relative-day.js";

/**
 * Le jour lu est **dérivé de maintenant**, jamais écrit en dur : `relativeDayOf`
 * le compare à l'horloge, et une date figée passerait un jour pour « demain ».
 *
 * Déplacés de `production-packing.spec.ts` avec la fonction, le 2026-09-14.
 */
const NOW = new Date();
const TODAY = instantToLocal(NOW).day;

describe("la journée relative — selon l'horloge du serveur", () => {
  it("dit « today », « tomorrow », ou rien", () => {
    expect(relativeDayOf(TODAY, NOW)).toBe("today");
    expect(relativeDayOf(addDays(TODAY, 1), NOW)).toBe("tomorrow");
    expect(relativeDayOf(addDays(TODAY, 2), NOW)).toBeNull();
    expect(relativeDayOf(addDays(TODAY, -1), NOW)).toBeNull();
  });

  it("🔴 lit le jour à l'heure de PARIS, pas en UTC", () => {
    // À 00 h 30 à Paris, il est encore la VEILLE en UTC (22 h 30 l'été, 23 h 30
    // l'hiver). Un `toISOString().slice(0, 10)` dirait « demain » d'une journée
    // que le fournil a déjà commencée.
    const justAfterMidnight = localToInstant(TODAY, "00:30");
    if (justAfterMidnight === null) {
      throw new Error("00:30 existe tous les jours à Paris — le changement d'heure est à 02:00.");
    }

    expect(relativeDayOf(TODAY, justAfterMidnight)).toBe("today");
    expect(todayOf(justAfterMidnight)).toBe(TODAY);
    expect(tomorrowOf(justAfterMidnight)).toBe(addDays(TODAY, 1));
  });
});
