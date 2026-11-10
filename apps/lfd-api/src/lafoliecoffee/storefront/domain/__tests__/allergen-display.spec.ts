import { allergenDisplayOf, InvalidAllergenDisplayError } from "../allergen-display.js";

describe("allergenDisplayOf", () => {
  it("reconnaît les deux places", () => {
    expect(allergenDisplayOf("sheet")).toBe("sheet");
    expect(allergenDisplayOf("gallery")).toBe("gallery");
  });

  it("refuse une place inconnue, en la nommant", () => {
    expect(() => allergenDisplayOf("cart")).toThrow(InvalidAllergenDisplayError);
    expect(() => allergenDisplayOf("cart")).toThrow(/« cart »/);
  });
});
