import { InvalidMinQuantityError } from "../../errors/min-quantity-errors.js";
import {
  NO_MIN_QUANTITIES,
  contextKeysOf,
  isEmptyMinQuantities,
  minQuantities,
  sameMinQuantities,
} from "../min-quantities.js";

describe("minQuantities — la grille audience × contexte, en pièces", () => {
  it("lit une grille d'entiers ≥ 2", () => {
    expect(minQuantities({ pro: { b2b: 6 }, public: { takeaway: 2 } })).toEqual({
      pro: { b2b: 6 },
      public: { takeaway: 2 },
    });
  });

  it("refuse 1, zéro, négatif et fractionnaire — en nommant la case", () => {
    for (const bad of [1, 0, -3, 2.5]) {
      expect(() => minQuantities({ pro: {}, public: { takeaway: bad } })).toThrow(
        InvalidMinQuantityError,
      );
    }
    expect(() => minQuantities({ pro: { b2b: 1 }, public: {} })).toThrow(/b2b/u);
  });

  it("compare sans regarder l'ordre des clés", () => {
    expect(
      sameMinQuantities(
        { pro: { b2b: 6, eatIn: 3 }, public: {} },
        { pro: { eatIn: 3, b2b: 6 }, public: {} },
      ),
    ).toBe(true);
    expect(sameMinQuantities({ pro: { b2b: 6 }, public: {} }, NO_MIN_QUANTITIES)).toBe(false);
  });

  it("nomme les contextes cités, une fois chacun", () => {
    expect(contextKeysOf({ pro: { b2b: 6 }, public: { b2b: 2, takeaway: 2 } })).toEqual([
      "b2b",
      "takeaway",
    ]);
    expect(isEmptyMinQuantities(NO_MIN_QUANTITIES)).toBe(true);
  });
});
