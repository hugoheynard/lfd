import { homeSuggestionsPayloadSchema } from "../home-suggestions.js";

/** La forme seule : ce qui s'applique à l'accueil se juge dans le commerce. */
describe("homeSuggestionsPayloadSchema", () => {
  const ok = (body: unknown) => homeSuggestionsPayloadSchema.safeParse(body).success;

  it("admet un panier vide sans jour visé, et un jour avec son point de retrait", () => {
    expect(ok({ skus: [], target: null })).toBe(true);
    expect(ok({ skus: ["VIE-001"], target: { date: "2026-10-19", pickupAddressId: null } })).toBe(
      true,
    );
  });

  it("refuse un SKU vide, un article de fiche, et un jour mal écrit", () => {
    expect(ok({ skus: [""], target: null })).toBe(false);
    expect(ok({ skus: [], sku: "PAI-001", target: null })).toBe(false);
    expect(ok({ skus: [], target: { date: "19/10", pickupAddressId: null } })).toBe(false);
  });
});
