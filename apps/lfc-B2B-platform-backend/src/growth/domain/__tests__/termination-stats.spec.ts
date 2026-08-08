import { computeTerminationStats, type TerminationRow } from "../termination-stats.js";

describe("computeTerminationStats", () => {
  const row = (
    partial: Partial<TerminationRow> & Pick<TerminationRow, "reason" | "outcome">,
  ): TerminationRow => ({ subReason: "", detail: "", recoveredVia: "", ...partial });
  const rows: TerminationRow[] = [
    row({ reason: "price", subReason: "delivery_cost", outcome: "confirmed" }),
    row({ reason: "price", subReason: "catalog_price", outcome: "confirmed" }),
    // 3 tentatives tarif ; la rattrapée l'est par la plateforme (auto).
    row({
      reason: "price",
      subReason: "delivery_cost",
      outcome: "recovered",
      recoveredVia: "auto",
    }),
    row({
      reason: "competitor",
      subReason: "better_price",
      detail: "beverages",
      outcome: "confirmed",
    }),
    row({
      reason: "competitor",
      subReason: "better_price",
      detail: "grocery",
      outcome: "confirmed",
    }),
    // Rattrapage concurrent sauvé à la main (sales).
    row({
      reason: "competitor",
      subReason: "better_price",
      outcome: "recovered",
      recoveredVia: "sales",
    }),
    row({ reason: "unknown_x", outcome: "confirmed" }), // raison inconnue → other / Non précisé
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

  it("3ᵉ anneau : « Meilleur prix » se détaille par catégorie produit", () => {
    const view = computeTerminationStats(rows);
    const competitor = view.reasons.find((r) => r.reason === "competitor");
    expect(competitor?.count).toBe(2);
    const betterPrice = competitor?.children.find((c) => c.subReason === "better_price");
    expect(betterPrice?.count).toBe(2);
    const detail = new Map(betterPrice?.children?.map((c) => [c.label, c.count]));
    expect(detail.get("Boissons")).toBe(1);
    expect(detail.get("Épicerie")).toBe(1);
  });

  it("taux de rattrapage global et par catégorie", () => {
    const view = computeTerminationStats(rows);
    expect(view.recovery).toMatchObject({ attempts: 7, recovered: 2 });
    expect(view.recovery.rate).toBeCloseTo(2 / 7);
    const price = view.recoveryByReason.find((r) => r.reason === "price");
    expect(price).toMatchObject({ attempts: 3, recovered: 1 });
    expect(price?.rate).toBeCloseTo(1 / 3);
  });

  it("rattrapage décomposé par canal (auto plateforme / sales commercial)", () => {
    const view = computeTerminationStats(rows);
    // Global : 1 rattrapage auto (tarif) + 1 sales (concurrent).
    expect(view.recovery).toMatchObject({ recoveredAuto: 1, recoveredSales: 1 });
    const price = view.recoveryByReason.find((r) => r.reason === "price");
    expect(price).toMatchObject({ recoveredAuto: 1, recoveredSales: 0 });
    const competitor = view.recoveryByReason.find((r) => r.reason === "competitor");
    expect(competitor).toMatchObject({ recoveredAuto: 0, recoveredSales: 1 });
  });

  it("corpus vide : global neutre, listes vides", () => {
    const view = computeTerminationStats([]);
    expect(view).toEqual({
      reasons: [],
      recovery: {
        reason: "all",
        label: "Global",
        attempts: 0,
        recovered: 0,
        recoveredAuto: 0,
        recoveredSales: 0,
        rate: 0,
      },
      recoveryByReason: [],
    });
  });
});
