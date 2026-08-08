import {
  type ActivatedInZone,
  computeAdoption,
  penetrationTrend,
  type ZoneTarget,
} from "../market-adoption.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

describe("computeAdoption", () => {
  it("calcule la pénétration et le delta de points sur la période, trié décroissant", () => {
    const zones: ZoneTarget[] = [
      { codePostal: "75011", addressable: 200 },
      { codePostal: "69001", addressable: 100 },
      { codePostal: "13001", addressable: 0 }, // dénominateur inconnu.
    ];
    const activated = new Map<string, ActivatedInZone>([
      // 75011 : 20 activées, dont 12 avant le début → +8 récentes ⇒ +4 pts ; 4 perdues ⇒ 2 %.
      ["75011", { ville: "Paris", total: 20, beforeStart: 12, lost: 4 }],
      // 69001 : 30 activées, dont 30 avant → 0 récente ⇒ +0 pt, pénétration 30 %.
      ["69001", { ville: "Lyon", total: 30, beforeStart: 30, lost: 0 }],
    ]);
    const view = computeAdoption(zones, activated, [], [], NOW);

    // Tri : 69001 (30 %) avant 75011 (10 %) avant 13001 (0 %).
    expect(view.zones.map((z) => z.codePostal)).toEqual(["69001", "75011", "13001"]);
    const paris = view.zones.find((z) => z.codePostal === "75011");
    expect(paris).toMatchObject({
      ville: "Paris",
      activated: 20,
      penetration: 0.1,
      deltaPts: 4,
      lost: 4,
      lostRate: 0.02,
    });
    const lyon = view.zones.find((z) => z.codePostal === "69001");
    expect(lyon?.penetration).toBeCloseTo(0.3);
    expect(lyon?.deltaPts).toBe(0);
    // Dénominateur inconnu : pénétration et delta neutralisés (pas de division par 0).
    expect(view.zones.find((z) => z.codePostal === "13001")).toMatchObject({
      penetration: 0,
      deltaPts: 0,
    });
    expect(view.computedAt).toBe(NOW.toISOString());
  });
});

describe("penetrationTrend", () => {
  const WINDOW = ["2026-08-03", "2026-08-10", "2026-08-17"];

  it("cumule les activations à la clôture de chaque semaine, sur l'addressable total", () => {
    const dates = [
      new Date("2026-08-05T00:00:00.000Z"), // semaine 1
      new Date("2026-08-12T00:00:00.000Z"), // semaine 2
      new Date("2026-08-13T00:00:00.000Z"), // semaine 2
    ];
    const trend = penetrationTrend(WINDOW, dates, 100);

    expect(trend.map((p) => p.penetration)).toEqual([0.01, 0.03, 0.03]);
    expect(trend.map((p) => p.weekStart)).toEqual(WINDOW);
  });

  it("neutralise un addressable nul (pas de division par 0)", () => {
    const trend = penetrationTrend(WINDOW, [new Date("2026-08-05T00:00:00.000Z")], 0);
    expect(trend.every((p) => p.penetration === 0)).toBe(true);
  });
});
