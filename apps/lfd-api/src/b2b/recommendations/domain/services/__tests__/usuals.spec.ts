import {
  rankUsuals,
  reasonOf,
  USUALS_MIN_ORDERS,
  usualsWindowStart,
  WEEKLY_RHYTHM_MIN_OCCURRENCES,
} from "../usuals.js";

/** Des mardis, mercredis et jeudis consécutifs — les dates ne sont comparées qu'entre elles. */
const TUESDAYS = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"] as const;
const WEDNESDAYS = ["2026-09-02", "2026-09-09", "2026-09-16"] as const;
const THURSDAYS = ["2026-09-03", "2026-09-10", "2026-09-17"] as const;

describe("reasonOf — le rythme hebdomadaire ou la fréquence", () => {
  it("dit « tous les mardis » à partir du minimum d'occurrences ce jour-là", () => {
    expect(WEEKLY_RHYTHM_MIN_OCCURRENCES).toBe(3);
    expect(reasonOf(TUESDAYS.slice(0, 3))).toEqual({
      source: "data",
      kind: "weekly_rhythm",
      weekday: "tue",
    });
  });

  it("retombe sur « fréquent » quand le jour dominant n'a que deux occurrences — deux mardis ne font pas un rythme", () => {
    const days = [TUESDAYS[0], TUESDAYS[1], WEDNESDAYS[0], THURSDAYS[0]];
    expect(reasonOf(days)).toEqual({ source: "data", kind: "frequent", orderCount: 4 });
  });

  it("retombe sur « fréquent » quand deux jours sont à égalité au-dessus du minimum", () => {
    expect(reasonOf([...WEDNESDAYS, ...THURSDAYS])).toEqual({
      source: "data",
      kind: "frequent",
      orderCount: 6,
    });
  });

  it("garde le rythme quand un jour domine malgré quelques commandes d'autres jours", () => {
    expect(reasonOf([...TUESDAYS, WEDNESDAYS[0], THURSDAYS[0]])).toMatchObject({
      kind: "weekly_rhythm",
      weekday: "tue",
    });
  });

  it("lit le dimanche et le lundi aux bonnes clés", () => {
    expect(reasonOf(["2026-09-06", "2026-09-13", "2026-09-20"])).toMatchObject({ weekday: "sun" });
    expect(reasonOf(["2026-09-07", "2026-09-14", "2026-09-21"])).toMatchObject({ weekday: "mon" });
  });
});

describe("rankUsuals — le seuil et l'ordre", () => {
  it(`écarte un article commandé moins de ${USUALS_MIN_ORDERS} fois`, () => {
    const ranked = rankUsuals(
      [
        { sku: "PAI-001", days: TUESDAYS.slice(0, 2) },
        { sku: "VIE-001", days: TUESDAYS.slice(0, 3) },
      ],
      [],
    );
    expect(ranked.map((candidate) => candidate.sku)).toEqual(["VIE-001"]);
  });

  it("classe le plus repris d'abord, puis le plus récent, puis le SKU", () => {
    const ranked = rankUsuals(
      [
        { sku: "C", days: WEDNESDAYS },
        { sku: "A", days: TUESDAYS },
        { sku: "D", days: THURSDAYS },
        { sku: "B", days: THURSDAYS },
      ],
      [],
    );
    expect(ranked.map((candidate) => candidate.sku)).toEqual(["A", "B", "D", "C"]);
  });

  it("n'offre pas un article déjà au panier", () => {
    expect(rankUsuals([{ sku: "VIE-001", days: TUESDAYS }], ["VIE-001"])).toEqual([]);
  });

  it("rend une liste vide sans historique — jamais de remplissage", () => {
    expect(rankUsuals([], [])).toEqual([]);
  });
});

describe("usualsWindowStart — douze mois, aujourd'hui compris", () => {
  it("recule d'un an au même quantième", () => {
    expect(usualsWindowStart("2026-10-18")).toBe("2025-10-18");
    expect(usualsWindowStart("2026-01-05")).toBe("2025-01-05");
  });

  it("ramène un 29 février au dernier jour du mois", () => {
    expect(usualsWindowStart("2028-02-29")).toBe("2027-02-28");
  });
});
