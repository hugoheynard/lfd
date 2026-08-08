import { computeTerminationStats, type TerminationRow } from "../termination-stats.js";

describe("computeTerminationStats", () => {
  const rows: TerminationRow[] = [
    { reason: "price", outcome: "confirmed" },
    { reason: "price", outcome: "confirmed" },
    { reason: "price", outcome: "recovered" }, // 3 tentatives tarif, 1 rattrapée
    { reason: "competitor", outcome: "confirmed" },
    { reason: "unknown_x", outcome: "confirmed" }, // raison inconnue → other
  ];

  it("camembert = résiliations confirmées par raison (rattrapées exclues)", () => {
    const view = computeTerminationStats(rows);
    const byReason = new Map(view.reasons.map((r) => [r.reason, r.count]));
    expect(byReason.get("price")).toBe(2);
    expect(byReason.get("competitor")).toBe(1);
    expect(byReason.get("other")).toBe(1);
    // Une catégorie sans confirmation n'apparaît pas.
    expect(view.reasons.some((r) => r.reason === "quality")).toBe(false);
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
