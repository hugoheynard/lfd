import type { AudiencePickupDiscount } from "@lfd/contracts";

import { PickupDiscount } from "../pickup-discount.js";
import {
  PickupDiscountDuplicateRuleError,
  PickupDiscountScopeIncludesNothingError,
} from "../pickup-errors.js";

/**
 * Les règles de la remise d'un point (plan
 * `plan-remise-retrait-par-clientele-et-exclusions.md`, et le mode de portée
 * décidé le 2026-10-22). « Pas de règle sans réduction » est structurel : une
 * clientèle sans remise vaut `null`, il n'y a rien à refuser.
 */
const TEN_PERCENT: AudiencePickupDiscount = {
  adjustment: { mode: "percent", bp: 1_000 },
  scope: "all_except",
  categories: [],
  products: [],
};

describe("PickupDiscount", () => {
  it("garde une remise par clientèle, chacune la sienne", () => {
    const individual = { ...TEN_PERCENT, adjustment: { mode: "amount", cents: 200 } } as const;

    const discount = PickupDiscount.of({ b2b: TEN_PERCENT, b2c: individual });

    expect(discount.discounts).toEqual({ b2b: TEN_PERCENT, b2c: individual });
  });

  it("accepte qu'aucune clientèle n'ait de remise", () => {
    expect(PickupDiscount.of({ b2b: null, b2c: null }).discounts).toEqual({ b2b: null, b2c: null });
  });

  it("accepte une famille exclue et un produit réinclus (Q1)", () => {
    const ruled: AudiencePickupDiscount = {
      ...TEN_PERCENT,
      categories: [{ categoryId: "c_boissons", eligible: false }],
      products: [{ productId: "p_jus", eligible: true }],
    };

    expect(PickupDiscount.of({ b2b: ruled, b2c: null }).b2b).toEqual(ruled);
  });

  it("refuse une remise « seulement » qui n'inclut rien, en nommant la clientèle et la sortie", () => {
    const empty: AudiencePickupDiscount = {
      ...TEN_PERCENT,
      scope: "only",
      products: [{ productId: "p_jus", eligible: false }],
    };
    const attempt = (): PickupDiscount => PickupDiscount.of({ b2b: null, b2c: empty });

    expect(attempt).toThrow(PickupDiscountScopeIncludesNothingError);
    expect(attempt).toThrow(/remise des particuliers.*ajoutez une famille ou un produit/u);
  });

  it("accepte une remise « seulement » dès qu'une famille est incluse", () => {
    const only: AudiencePickupDiscount = {
      ...TEN_PERCENT,
      scope: "only",
      categories: [{ categoryId: "c_pains", eligible: true }],
    };

    expect(PickupDiscount.of({ b2b: only, b2c: null }).b2b?.scope).toBe("only");
  });

  it("refuse un produit réglé deux fois", () => {
    const twice: AudiencePickupDiscount = {
      ...TEN_PERCENT,
      products: [
        { productId: "p_jus", eligible: true },
        { productId: "p_jus", eligible: false },
      ],
    };

    expect(() => PickupDiscount.of({ b2b: twice, b2c: null })).toThrow(
      PickupDiscountDuplicateRuleError,
    );
  });
});
