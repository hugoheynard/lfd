import { usualSuggestionsPayloadSchema } from "../usual-suggestions.js";

/** La forme seule : le seuil, le rythme et le mur se jugent dans le commerce. */
describe("usualSuggestionsPayloadSchema", () => {
  const ok = (body: unknown) => usualSuggestionsPayloadSchema.safeParse(body).success;

  it("admet un panier vide sans jour visé, et un jour avec son point de retrait", () => {
    expect(ok({ skus: [], target: null })).toBe(true);
    expect(ok({ skus: ["VIE-001"], target: { date: "2026-10-20", pickupAddressId: "pa_1" } })).toBe(
      true,
    );
  });

  it("refuse une société dans le corps : elle vient du contexte de la requête, jamais du client", () => {
    expect(ok({ skus: [], target: null, companyId: "co_other" })).toBe(false);
  });
});
