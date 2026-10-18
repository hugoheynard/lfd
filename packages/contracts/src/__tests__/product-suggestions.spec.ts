import { productSuggestionsPayloadSchema } from "../product-suggestions.js";

/** La forme seule : ce qui s'applique à la fiche se juge dans le commerce. */
describe("productSuggestionsPayloadSchema", () => {
  it("admet une fiche avec un panier vide, et un jour avec son point de retrait", () => {
    const ok = (body: unknown) => productSuggestionsPayloadSchema.safeParse(body).success;

    expect(ok({ sku: "PAI-001", skus: [], target: null })).toBe(true);
    expect(
      ok({
        sku: "PAI-001",
        skus: ["VIE-001"],
        target: { date: "2026-10-19", pickupAddressId: null },
      }),
    ).toBe(true);
  });

  it("refuse une fiche sans SKU, un champ inconnu, et plus de cent références", () => {
    const ok = (body: unknown) => productSuggestionsPayloadSchema.safeParse(body).success;

    expect(ok({ skus: [], target: null })).toBe(false);
    expect(ok({ sku: "", skus: [], target: null })).toBe(false);
    expect(ok({ sku: "A", skus: [], target: null, audience: "pro" })).toBe(false);
    expect(
      ok({ sku: "A", skus: Array.from({ length: 101 }, (_, i) => `S-${i}`), target: null }),
    ).toBe(false);
  });
});
