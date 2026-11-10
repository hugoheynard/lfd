import { computeTerminationStats, type TerminationRow } from "../termination-stats.js";

describe("computeTerminationStats", () => {
  const row = (
    partial: Partial<TerminationRow> & Pick<TerminationRow, "reason" | "outcome">,
  ): TerminationRow => ({
    subReason: "",
    detail: "",
    recoveredVia: "",
    createdAt: "2026-01-05T00:00:00.000Z",
    resolvedAt: null,
    ...partial,
  });
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

  it("vélocité de rattrapage : taux par semaine de la tentative, trié chronologiquement", () => {
    // Semaine A (plus ancienne) : 0/2 rattrapées ; semaine B : 2/2 → efficacité qui monte.
    const week = [
      row({ reason: "price", outcome: "confirmed", createdAt: "2026-01-05T00:00:00.000Z" }),
      row({ reason: "price", outcome: "confirmed", createdAt: "2026-01-06T00:00:00.000Z" }),
      row({ reason: "price", outcome: "recovered", createdAt: "2026-01-12T00:00:00.000Z" }),
      row({ reason: "price", outcome: "recovered", createdAt: "2026-01-13T00:00:00.000Z" }),
    ];
    const trend = computeTerminationStats(week).recoveryTrend;
    expect(trend.map((p) => p.rate)).toEqual([0, 1]);
    expect(trend[0]?.weekStart.localeCompare(trend[1]?.weekStart ?? "")).toBeLessThan(0);
  });

  it("vélocité : une seule semaine ⇒ série vide (rien à tracer)", () => {
    expect(computeTerminationStats(rows).recoveryTrend).toEqual([]);
  });

  it("délai de réaction : boxplot par catégorie (≥ 3 rattrapages), outliers Tukey", () => {
    const day = (n: number): string => `2026-02-${String(n).padStart(2, "0")}T00:00:00.000Z`;
    // Tarif : 4 rattrapages à 1,1,2,2 j + un outlier à 20 j.
    const delays = [1, 1, 2, 2, 20];
    const rowsR = delays.map((d) =>
      row({ reason: "price", outcome: "recovered", createdAt: day(1), resolvedAt: day(1 + d) }),
    );
    const stat = computeTerminationStats(rowsR).reactionByReason.find((r) => r.reason === "price");
    expect(stat?.count).toBe(5);
    expect(stat?.box.median).toBe(2);
    expect(stat?.box.outliers).toContain(20);
    expect(stat?.box.high).toBeLessThan(20); // moustache sous l'outlier
  });

  it("délai de réaction : catégorie sous 3 rattrapages exclue", () => {
    const two = [
      row({
        reason: "quality",
        outcome: "recovered",
        createdAt: "2026-03-01T00:00:00.000Z",
        resolvedAt: "2026-03-05T00:00:00.000Z",
      }),
      row({
        reason: "quality",
        outcome: "recovered",
        createdAt: "2026-03-01T00:00:00.000Z",
        resolvedAt: "2026-03-04T00:00:00.000Z",
      }),
    ];
    expect(computeTerminationStats(two).reactionByReason).toEqual([]);
  });

  it("délai de réaction hebdo : boîtes groupées par catégorie, alignées sur les semaines", () => {
    // Tarif : ≥ 3 rattrapages sur 2 semaines distinctes → 1 série, 2 cases.
    const mk = (created: string, resolved: string): TerminationRow =>
      row({ reason: "price", outcome: "recovered", createdAt: created, resolvedAt: resolved });
    const byWeek = computeTerminationStats([
      mk("2026-02-02T00:00:00.000Z", "2026-02-04T00:00:00.000Z"),
      mk("2026-02-03T00:00:00.000Z", "2026-02-06T00:00:00.000Z"),
      mk("2026-02-10T00:00:00.000Z", "2026-02-11T00:00:00.000Z"),
    ]).reactionByWeek;
    expect(byWeek.weeks).toHaveLength(2);
    expect(byWeek.weeks[0]?.localeCompare(byWeek.weeks[1] ?? "")).toBeLessThan(0);
    const price = byWeek.series.find((s) => s.reason === "price");
    expect(price?.cells).toHaveLength(2); // aligné sur weeks
    expect(price?.cells[0]?.count).toBe(2);
    expect(price?.cells[1]?.count).toBe(1);
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
      recoveryTrend: [],
      reactionByReason: [],
      reactionByWeek: { weeks: [], series: [] },
    });
  });
});
