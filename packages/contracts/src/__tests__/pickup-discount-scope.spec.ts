import {
  type AudiencePickupDiscount,
  pickupDiscountCovers,
  pickupDiscountHasRules,
} from "../pickup-discount-scope.js";

const TEN_PERCENT = { mode: "percent", bp: 1000 } as const;

function discount(overrides: Partial<AudiencePickupDiscount>): AudiencePickupDiscount {
  return {
    adjustment: TEN_PERCENT,
    scope: "all_except",
    categories: [],
    products: [],
    ...overrides,
  };
}

const CROISSANT = { productId: "p_croissant", categoryPath: ["c_viennoiserie"] };
const JUS = { productId: "p_jus", categoryPath: ["c_jus", "c_boissons"] };

describe("pickupDiscountCovers", () => {
  it("couvre toute ligne en « toutes sauf » sans règle", () => {
    expect(pickupDiscountCovers(discount({}), CROISSANT)).toBe(true);
  });

  it("ne couvre aucune ligne en « seulement » sans inclusion qui la vise", () => {
    expect(pickupDiscountCovers(discount({ scope: "only" }), CROISSANT)).toBe(false);
  });

  it("retire une famille exclue, et ses sous-familles", () => {
    const rule = discount({ categories: [{ categoryId: "c_boissons", eligible: false }] });

    expect(pickupDiscountCovers(rule, JUS)).toBe(false);
    expect(pickupDiscountCovers(rule, CROISSANT)).toBe(true);
  });

  it("laisse la famille la plus proche l'emporter sur sa parente", () => {
    const rule = discount({
      categories: [
        { categoryId: "c_boissons", eligible: false },
        { categoryId: "c_jus", eligible: true },
      ],
    });

    expect(pickupDiscountCovers(rule, JUS)).toBe(true);
  });

  it("réinclut un produit dans une famille exclue (Q1)", () => {
    const rule = discount({
      categories: [{ categoryId: "c_boissons", eligible: false }],
      products: [{ productId: "p_jus", eligible: true }],
    });

    expect(pickupDiscountCovers(rule, JUS)).toBe(true);
  });

  it("en « seulement », inclut une famille et en retire un produit", () => {
    const rule = discount({
      scope: "only",
      categories: [{ categoryId: "c_viennoiserie", eligible: true }],
      products: [{ productId: "p_croissant", eligible: false }],
    });

    expect(pickupDiscountCovers(rule, CROISSANT)).toBe(false);
    expect(
      pickupDiscountCovers(rule, { productId: "p_pain_choc", categoryPath: ["c_viennoiserie"] }),
    ).toBe(true);
  });

  it("juge un produit inconnu du catalogue par le seul mode", () => {
    const facts = { productId: null, categoryPath: [] };

    expect(pickupDiscountCovers(discount({}), facts)).toBe(true);
    expect(pickupDiscountCovers(discount({ scope: "only" }), facts)).toBe(false);
  });
});

describe("pickupDiscountHasRules", () => {
  it("dit qu'une remise « toutes sauf » sans règle couvre tout", () => {
    expect(pickupDiscountHasRules(discount({}))).toBe(false);
    expect(pickupDiscountHasRules(discount({ scope: "only" }))).toBe(true);
  });
});
