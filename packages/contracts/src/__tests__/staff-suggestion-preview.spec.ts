import { staffSuggestionPreviewPayloadSchema } from "../staff-suggestion-preview.js";

/** La forme seule : le diagnostic se calcule dans le commerce. */
describe("staffSuggestionPreviewPayloadSchema", () => {
  const ok = (body: unknown) => staffSuggestionPreviewPayloadSchema.safeParse(body).success;
  const common = { skus: [], audience: "public", day: null, pickupAddressId: null };

  it("admet un panier et une fiche, avec ou sans jour", () => {
    expect(ok({ placement: "cart", ...common, skus: ["VIE-001"] })).toBe(true);
    expect(ok({ placement: "product", viewedSku: "PAI-001", ...common, day: "2026-10-19" })).toBe(
      true,
    );
  });

  it("refuse une fiche sans article, l'accueil, une clientèle « both » et un champ inconnu", () => {
    expect(ok({ placement: "product", ...common })).toBe(false);
    expect(ok({ placement: "home", ...common })).toBe(false);
    expect(ok({ placement: "cart", ...common, audience: "both" })).toBe(false);
    expect(ok({ placement: "cart", ...common, viewedSku: "PAI-001" })).toBe(false);
    expect(ok({ placement: "cart", ...common, day: "18/10/2026" })).toBe(false);
  });
});
