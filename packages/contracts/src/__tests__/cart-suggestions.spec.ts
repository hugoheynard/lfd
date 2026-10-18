import { cartSuggestionsPayloadSchema } from "../cart-suggestions.js";

/** La forme seule : ce qui s'applique au panier se juge dans le commerce. */
describe("cartSuggestionsPayloadSchema", () => {
  it("admet un panier vide sans jour visé, et un jour avec son point de retrait", () => {
    expect(cartSuggestionsPayloadSchema.safeParse({ skus: [], target: null }).success).toBe(true);
    expect(
      cartSuggestionsPayloadSchema.safeParse({
        skus: ["VIE-001"],
        target: { date: "2026-10-19", pickupAddressId: null },
      }).success,
    ).toBe(true);
  });

  it("refuse un jour mal écrit, un SKU vide, un champ inconnu, et plus de cent références", () => {
    const refused = (body: unknown) => cartSuggestionsPayloadSchema.safeParse(body).success;

    expect(refused({ skus: [], target: { date: "19/10", pickupAddressId: null } })).toBe(false);
    expect(refused({ skus: [""], target: null })).toBe(false);
    expect(refused({ skus: [], target: null, audience: "pro" })).toBe(false);
    expect(refused({ skus: Array.from({ length: 101 }, (_, i) => `S-${i}`), target: null })).toBe(
      false,
    );
  });

  it("RS8 : le total du panier, facultatif, en centimes entiers et positifs", () => {
    const ok = (body: unknown) => cartSuggestionsPayloadSchema.safeParse(body).success;
    expect(ok({ skus: [], target: null, cartTotalCents: 0 })).toBe(true);
    expect(ok({ skus: [], target: null, cartTotalCents: 2_450 })).toBe(true);
    expect(ok({ skus: [], target: null, cartTotalCents: 24.5 })).toBe(false);
    expect(ok({ skus: [], target: null, cartTotalCents: -1 })).toBe(false);
  });
});
