import { pieceTally } from "../sale-quantity-tally.js";
import { grams, pieces } from "../sale-quantity.js";

describe("pieceTally — un article au poids compte pour une ligne", () => {
  it("compte les pièces d'une ligne à la pièce", () => {
    expect(pieceTally(pieces(12))).toBe(12);
    expect(pieceTally(pieces(0))).toBe(0);
  });

  it.each([1, 20, 1250, 1_000_000])("compte %i g pour une ligne", (weight) => {
    expect(pieceTally(grams(weight))).toBe(1);
  });

  it("une ligne au poids réduite à 0 g ne compte pour rien", () => {
    expect(pieceTally(grams(0))).toBe(0);
  });

  it("additionne une commande mêlée sans que les grammes écrasent les pièces", () => {
    const lines = [pieces(12), grams(1250), pieces(3), grams(500)];
    expect(lines.reduce((sum, line) => sum + pieceTally(line), 0)).toBe(17);
  });
});
