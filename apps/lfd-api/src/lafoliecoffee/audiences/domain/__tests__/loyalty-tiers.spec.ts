import { LOYALTY_TIERS, loyaltyBounds, loyaltyTierIndexOf } from "../loyalty-tiers.js";

describe("la fidélité sur la période", () => {
  it("passe à la base les seuils 2 et 5", () => {
    expect(loyaltyBounds()).toEqual([2, 5]);
  });

  it("range 1 commande, 2 à 4, puis 5 et plus", () => {
    const tierOf = (orders: number) => LOYALTY_TIERS[loyaltyTierIndexOf(orders)]?.key;
    expect([1, 2, 4, 5, 12].map(tierOf)).toEqual(["once", "regular", "regular", "loyal", "loyal"]);
  });
});
