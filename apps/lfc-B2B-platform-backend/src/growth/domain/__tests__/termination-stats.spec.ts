import { computeTerminationStats, type TerminationRow } from "../termination-stats.js";

describe("computeTerminationStats", () => {
  const rows: TerminationRow[] = [
    { reason: "price", subReason: "delivery_cost", outcome: "confirmed" },
    { reason: "price", subReason: "catalog_price", outcome: "confirmed" },
    { reason: "price", subReason: "delivery_cost", outcome: "recovered" }, // 3 tentatives tarif
    { reason: "competitor", subReason: "better_price", outcome: "confirmed" },
    { reason: "unknown_x", subReason: "", outcome: "confirmed" }, // raison inconnue → other / Non précisé
  ];

  it("sunburst = raison → sous-raison, résiliations confirmées (rattrapées exclues)", () => {
    const view = computeTerminationStats(rows);
    const price = view.reasons.find((r) => r.reason === "price");
    expect(price?.count).toBe(2); // la rattrapée n'entre pas
    const priceSubs = new Map(price?.children.map((c) => [c.label, c.count]));
    expect(priceSubs.get("Livraison trop chère")).toBe(1);
    expect(priceSubs.get("Catalogue trop cher")).toBe(1);
    // Raison inconnue → other, sous-raison vide → « Non précisé ».
    const other = view.reasons.find((r) => r.reason === "other");
    expect(other?.children.find((c) => c.label === "Non précisé")?.count).toBe(1);
  });

  it("taux de rattrapage global et par catégorie", () => {
    const view = computeTerminationStats(rows);
    expect(view.recovery).toMatchObject({ attempts: 5, recovered: 1, rate: 0.2 });
    const price = view.recoveryByReason.find((r) => r.reason === "price");
    expect(price).toMatchObject({ attempts: 3, recovered: 1 });
    expect(price?.rate).toBeCloseTo(1 / 3);
  });

  it("corpus vide : global neutre, listes vides", () => {
    const view = computeTerminationStats([]);
    expect(view).toEqual({
      reasons: [],
      recovery: { reason: "all", label: "Global", attempts: 0, recovered: 0, rate: 0 },
      recoveryByReason: [],
    });
  });
});
