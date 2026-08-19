import { dayKey, dayRange } from "../growth-stats.js";

describe("dayKey", () => {
  it("normalise une date-heure UTC vers son jour", () => {
    expect(dayKey(new Date("2026-08-20T23:59:59.000Z"))).toBe("2026-08-20");
    expect(dayKey(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
  });
});

describe("dayRange", () => {
  it("énumère les jours de start à end inclus, dans l'ordre", () => {
    expect(dayRange("2026-08-18", "2026-08-21")).toEqual([
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);
  });

  it("franchit une bordure de mois", () => {
    expect(dayRange("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });

  it("renvoie un seul jour quand start === end", () => {
    expect(dayRange("2026-08-20", "2026-08-20")).toEqual(["2026-08-20"]);
  });

  it("renvoie vide quand end précède start", () => {
    expect(dayRange("2026-08-20", "2026-08-19")).toEqual([]);
  });
});
