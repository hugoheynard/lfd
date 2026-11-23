import { settlementRegimeSchema } from "../order-sheet.js";
import { shopTillOrdersReportQuerySchema } from "../shop-till-orders-report.js";

describe("le régime de règlement — à régler en boutique", () => {
  it("admet `shop_till` et `offered`, à côté des régimes d'avant", () => {
    expect(settlementRegimeSchema.options).toEqual([
      "paid",
      "due",
      "account",
      "free",
      "shop_till",
      "offered",
    ]);
  });
});

describe("shopTillOrdersReportQuerySchema", () => {
  it("lit deux jours de retrait", () => {
    expect(shopTillOrdersReportQuerySchema.parse({ from: "2026-11-01", to: "2026-11-30" })).toEqual(
      { from: "2026-11-01", to: "2026-11-30" },
    );
  });

  it.each([
    ["un jour mal écrit", { from: "01/11/2026", to: "2026-11-30" }],
    ["une borne manquante", { from: "2026-11-01" }],
    ["un champ inconnu", { from: "2026-11-01", to: "2026-11-30", site: "x" }],
  ])("refuse %s", (_case, query) => {
    expect(shopTillOrdersReportQuerySchema.safeParse(query).success).toBe(false);
  });
});
