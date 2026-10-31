import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import { placedTermsOf, termsAdmit, type FrozenDiscountTerms } from "../frozen-discount-terms.js";

/**
 * **La cible figée d'une remise** (`documentation/promotions/plan-remises-acquises.md`,
 * § 10.2) : ce que L9 lit au lieu de rejuger la promotion.
 */

const FROM = new Date("2030-01-01T00:00:00.000Z");

function terms(
  pickup: FrozenDiscountTerms["pickup"],
  delivery: FrozenDiscountTerms["delivery"],
): FrozenDiscountTerms {
  return { cumulative: false, minQuantity: null, pickup, delivery, origin: "placed" };
}

describe("termsAdmit", () => {
  it("« tous les points » admet tout retrait, aucune livraison s'il n'en coche pas", () => {
    const allPoints = terms("all", "none");

    expect(termsAdmit(allPoints, { method: "pickup", pickupId: "p2", zoneId: null })).toBe(true);
    expect(termsAdmit(allPoints, { method: "delivery", pickupId: null, zoneId: "z1" })).toBe(false);
  });

  it("une sélection n'admet que ses points, et ses zones", () => {
    const listed = terms({ points: ["p1"] }, { zones: ["z1"] });

    expect(termsAdmit(listed, { method: "pickup", pickupId: "p1", zoneId: null })).toBe(true);
    expect(termsAdmit(listed, { method: "pickup", pickupId: "p2", zoneId: null })).toBe(false);
    expect(termsAdmit(listed, { method: "delivery", pickupId: null, zoneId: "z1" })).toBe(true);
    expect(termsAdmit(listed, { method: "delivery", pickupId: null, zoneId: "z2" })).toBe(false);
  });

  it("un retrait dont le point n'est pas connu n'entre pas dans une sélection", () => {
    expect(
      termsAdmit(terms({ points: ["p1"] }, "none"), {
        method: "pickup",
        pickupId: null,
        zoneId: null,
      }),
    ).toBe(false);
  });
});

describe("placedTermsOf", () => {
  it("fige cumulable, seuil et cible d'une promotion de panier", () => {
    const promotion = livePromotion({
      id: "p",
      validFrom: FROM,
      cumulative: true,
      conditions: [{ kind: "min_quantity", value: 10 }],
      fulfillment: { kind: "basket", pickup: { points: ["p1"] }, delivery: "all" },
    });

    expect(placedTermsOf(promotion)).toEqual({
      cumulative: true,
      minQuantity: 10,
      pickup: { points: ["p1"] },
      delivery: "all",
      origin: "placed",
    });
  });

  it("une promotion « dans le prix affiché » n'est jamais au panier : aucun terme", () => {
    const line = livePromotion({
      id: "l",
      validFrom: FROM,
      fulfillment: { kind: "displayed_price" },
    });

    expect(placedTermsOf(line)).toBeNull();
  });
});
