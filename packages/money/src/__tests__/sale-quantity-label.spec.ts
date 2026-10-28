import { weightLabel } from "../sale-quantity-label.js";
import { grams, pieces, saleQuantity } from "../sale-quantity.js";

describe("weightLabel — grammes sous le kilo, kilos au-delà", () => {
  it.each([
    [20, "20 g"],
    [500, "500 g"],
    [999, "999 g"],
    [1000, "1 kg"],
    [1250, "1,25 kg"],
    [1005, "1,005 kg"],
    [2000, "2 kg"],
    [1_000_000, "1000 kg"],
  ])("%i g se dit « %s »", (amount, label) => {
    expect(weightLabel(amount)).toBe(label);
  });

  it("ne dit jamais « 0,02 kg »", () => {
    expect(weightLabel(20)).not.toContain("kg");
  });

  it("refuse un poids non entier plutôt que de l'arrondir", () => {
    expect(() => weightLabel(12.5)).toThrow(RangeError);
    expect(() => weightLabel(-1)).toThrow(RangeError);
  });
});

describe("saleQuantity — la quantité dans l'unité de la ligne", () => {
  it("rend des pièces pour une ligne à la pièce, des grammes pour une ligne au poids", () => {
    expect(saleQuantity(3, "piece")).toEqual(pieces(3));
    expect(saleQuantity(1250, "weight")).toEqual(grams(1250));
  });
});
