import { planVersionRangeQuerySchema } from "../plan-version-range.query-schema.js";

/** La forme de `?from=&to=` sur la comparaison des versions du plan. */
describe("planVersionRangeQuerySchema", () => {
  it("lit deux numéros de version depuis l'URL", () => {
    expect(planVersionRangeQuerySchema.parse({ from: "1", to: "3" })).toEqual({ from: 1, to: 3 });
  });

  it("laisse passer une plage inversée : c'est le noyau qui la refuse, en la nommant", () => {
    expect(planVersionRangeQuerySchema.parse({ from: "3", to: "1" })).toEqual({ from: 3, to: 1 });
  });

  it.each([
    ["absent", {}],
    ["un seul bord", { from: "1" }],
    ["pas un nombre", { from: "un", to: "2" }],
    ["décimal", { from: "1.5", to: "2" }],
    ["zéro", { from: "0", to: "2" }],
    ["négatif", { from: "-1", to: "2" }],
  ])("refuse une plage mal formée (%s)", (_case, raw) => {
    expect(planVersionRangeQuerySchema.safeParse(raw).success).toBe(false);
  });
});
