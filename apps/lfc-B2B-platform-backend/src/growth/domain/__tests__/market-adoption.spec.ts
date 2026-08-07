import { type ActivatedInZone, computeAdoption, type ZoneTarget } from "../market-adoption.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

describe("computeAdoption", () => {
  it("calcule la pénétration et le delta de points sur la période, trié décroissant", () => {
    const zones: ZoneTarget[] = [
      { codePostal: "75011", addressable: 200 },
      { codePostal: "69001", addressable: 100 },
      { codePostal: "13001", addressable: 0 }, // dénominateur inconnu.
    ];
    const activated = new Map<string, ActivatedInZone>([
      // 75011 : 20 activées, dont 12 avant le début → +8 récentes ⇒ +4 pts.
      ["75011", { ville: "Paris", total: 20, beforeStart: 12 }],
      // 69001 : 30 activées, dont 30 avant → 0 récente ⇒ +0 pt, pénétration 30 %.
      ["69001", { ville: "Lyon", total: 30, beforeStart: 30 }],
    ]);
    const view = computeAdoption(zones, activated, NOW);

    // Tri : 69001 (30 %) avant 75011 (10 %) avant 13001 (0 %).
    expect(view.zones.map((z) => z.codePostal)).toEqual(["69001", "75011", "13001"]);
    const paris = view.zones.find((z) => z.codePostal === "75011");
    expect(paris).toMatchObject({ ville: "Paris", activated: 20, penetration: 0.1, deltaPts: 4 });
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
