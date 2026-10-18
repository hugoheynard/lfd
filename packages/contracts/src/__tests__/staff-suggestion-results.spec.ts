import { staffSuggestionResultsQuerySchema } from "../staff-suggestion-results.js";

/** La forme seule : l'estimation se calcule dans le commerce. */
describe("staffSuggestionResultsQuerySchema", () => {
  const parse = (query: unknown) => staffSuggestionResultsQuerySchema.safeParse(query);

  it("admet 7, 30 et 90 jours, lus d'une chaîne de requête, et l'absence", () => {
    expect(parse({ days: "7" })).toMatchObject({ success: true, data: { days: 7 } });
    expect(parse({ days: "90" })).toMatchObject({ success: true, data: { days: 90 } });
    expect(parse({})).toMatchObject({ success: true, data: {} });
  });

  it("refuse une autre période et un champ inconnu", () => {
    expect(parse({ days: "14" }).success).toBe(false);
    expect(parse({ days: "trente" }).success).toBe(false);
    expect(parse({ days: "30", from: "2026-10-01" }).success).toBe(false);
  });
});
