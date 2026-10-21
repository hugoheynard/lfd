import { fatesFor, orderInstantOf, planInvoiceCalendar } from "../invoice-weeks.seed.js";

/**
 * Le calendrier du semis des factures. Les dates sont le SUJET : la fonction
 * reçoit son instant et ne lit aucune horloge, d'où des dates absolues,
 * comparées entre elles.
 */
describe("planInvoiceCalendar", () => {
  const now = new Date("2026-10-21T08:00:00.000Z");

  it("bascule en hebdomadaire au 1er du mois d'il y a six semaines, programmée la veille", () => {
    const calendar = planInvoiceCalendar(now);
    expect(calendar.weeklyFrom.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(calendar.modeSetAt.getTime()).toBeLessThan(calendar.weeklyFrom.getTime());
  });

  it("rend les lundis passés, retours d'abord, la dernière semaine émise sans lot", () => {
    const { weeks } = planInvoiceCalendar(now);
    expect(weeks.map((week) => week.closesAt.toISOString())).toEqual([
      "2026-09-06T22:00:00.000Z",
      "2026-09-13T22:00:00.000Z",
      "2026-09-20T22:00:00.000Z",
      "2026-09-27T22:00:00.000Z",
      "2026-10-04T22:00:00.000Z",
      "2026-10-11T22:00:00.000Z",
      "2026-10-18T22:00:00.000Z",
    ]);
    expect(weeks.map((week) => week.fate)).toEqual([
      "settled",
      "represented",
      "rejected",
      "group",
      "collected",
      "constituted",
      "issued",
    ]);
    expect(weeks[0]?.opensAt.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(weeks[1]?.opensAt).toEqual(weeks[0]?.closesAt);
  });

  it("place chaque commande dans sa semaine", () => {
    for (const week of planInvoiceCalendar(now).weeks) {
      const at = orderInstantOf(week.closesAt).getTime();
      expect(at).toBeGreaterThan(week.opensAt.getTime());
      expect(at).toBeLessThan(week.closesAt.getTime());
    }
  });

  it("ne garde pas une clôture dont le dépôt n'est pas encore passé", () => {
    const justAfterMonday = new Date("2026-10-18T23:00:00.000Z");
    const { weeks } = planInvoiceCalendar(justAfterMonday);
    expect(weeks.at(-1)?.closesAt.toISOString()).toBe("2026-10-11T22:00:00.000Z");
  });
});

describe("fatesFor", () => {
  it("garde les trois retours et la semaine émise même au plus court", () => {
    expect(fatesFor(4)).toEqual(["settled", "represented", "rejected", "issued"]);
    expect(fatesFor(5)).toEqual(["settled", "represented", "rejected", "group", "issued"]);
  });

  it("complète le milieu par des semaines prélevées", () => {
    expect(fatesFor(9).slice(3)).toEqual([
      "group",
      "collected",
      "constituted",
      "collected",
      "collected",
      "issued",
    ]);
  });
});
