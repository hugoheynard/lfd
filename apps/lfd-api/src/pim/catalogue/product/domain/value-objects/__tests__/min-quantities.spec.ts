import { InvalidMinQuantityError } from "../../errors/min-quantity-errors.js";
import {
  NO_MIN_QUANTITIES,
  isEmptyMinQuantities,
  minQuantities,
  sameMinQuantities,
} from "../min-quantities.js";

describe("minQuantities — un minimum par audience, en pièces", () => {
  it("lit des entiers ≥ 2, et `null` pour « aucun minimum »", () => {
    expect(minQuantities({ pro: 6, public: 2 })).toEqual({ pro: 6, public: 2 });
    expect(minQuantities({ pro: null, public: 3 })).toEqual({ pro: null, public: 3 });
  });

  it("refuse 1, zéro, négatif et fractionnaire — en nommant la clientèle", () => {
    for (const bad of [1, 0, -3, 2.5, Number.NaN]) {
      expect(() => minQuantities({ pro: null, public: bad })).toThrow(InvalidMinQuantityError);
    }
    expect(() => minQuantities({ pro: 1, public: null })).toThrow(/professionnels/u);
    expect(() => minQuantities({ pro: null, public: 1 })).toThrow(/particuliers/u);
  });

  it("compare les deux minimums", () => {
    expect(sameMinQuantities({ pro: 6, public: null }, { pro: 6, public: null })).toBe(true);
    expect(sameMinQuantities({ pro: 6, public: null }, NO_MIN_QUANTITIES)).toBe(false);
    expect(sameMinQuantities({ pro: null, public: 6 }, { pro: 6, public: null })).toBe(false);
  });

  it("dit vide la paire qui ne règle rien", () => {
    expect(isEmptyMinQuantities(NO_MIN_QUANTITIES)).toBe(true);
    expect(isEmptyMinQuantities({ pro: null, public: 2 })).toBe(false);
  });
});
