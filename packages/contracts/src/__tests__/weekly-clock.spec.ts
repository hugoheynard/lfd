import { clockRangeCovers, weeklyMomentOf, weeklyMomentOfLocal } from "../weekly-clock.js";

/**
 * Le juge de « tel jour, de telle heure à telle heure », partagé par les
 * suggestions et les promotions à heures. Instants comparés à la pendule de
 * Paris seulement — les bascules d'heure sont le sujet.
 */

describe("clockRangeCovers", () => {
  it("début compris, fin exclue, et une fin à minuit", () => {
    const evening = { start: "17:00", end: "19:00" };
    expect(clockRangeCovers(evening, "16:59")).toBe(false);
    expect(clockRangeCovers(evening, "17:00")).toBe(true);
    expect(clockRangeCovers(evening, "18:59")).toBe(true);
    expect(clockRangeCovers(evening, "19:00")).toBe(false);
    expect(clockRangeCovers({ start: "22:00", end: "24:00" }, "23:59")).toBe(true);
  });
});

describe("weeklyMomentOf", () => {
  it("lit le jour et l'heure de Paris, pas ceux d'UTC", () => {
    // Lundi 16 novembre 2026, 23 h 30 UTC = mardi 0 h 30 à Paris.
    expect(weeklyMomentOf(new Date("2026-11-16T23:30:00.000Z"))).toEqual({
      weekday: "tue",
      time: "00:30",
    });
  });

  it("suit l'heure murale de part et d'autre de la bascule de mars", () => {
    expect(weeklyMomentOf(new Date("2026-03-28T17:30:00.000Z")).time).toBe("18:30");
    expect(weeklyMomentOf(new Date("2026-03-29T17:30:00.000Z")).time).toBe("19:30");
  });

  it("une lecture locale garde son heure et donne son jour", () => {
    expect(weeklyMomentOfLocal({ day: "2026-11-18", time: "08:00" })).toEqual({
      weekday: "wed",
      time: "08:00",
    });
  });
});
