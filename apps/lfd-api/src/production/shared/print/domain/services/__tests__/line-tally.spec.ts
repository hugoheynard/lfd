import { figureFontSize, lineFigure, linePieces, piecesOfLines } from "../line-tally.js";

/** Les comptes et les chiffres des papiers du fournil, au poids (P6) — pur. */
describe("line-tally", () => {
  const pieces = (quantity: number) => ({ quantity, saleUnit: "piece" as const });
  const grams = (quantity: number) => ({ quantity, saleUnit: "weight" as const });

  it("compte des pièces telles quelles, et une ligne au poids pour une", () => {
    expect(linePieces(pieces(48))).toBe(48);
    expect(linePieces(grams(1250))).toBe(1);
    expect(linePieces(grams(1_000_000))).toBe(1);
  });

  it("ne compte rien pour une ligne au poids réduite à 0 g", () => {
    expect(linePieces(grams(0))).toBe(0);
  });

  it("additionne une commande mêlée en pièces : 12 croissants et un saumon font 13", () => {
    expect(piecesOfLines([pieces(12), grams(1250)])).toBe(13);
    expect(piecesOfLines([])).toBe(0);
  });

  it.each([
    [pieces(48), "48"],
    [grams(20), "20 g"],
    [grams(500), "500 g"],
    [grams(1250), "1,25 kg"],
    [grams(2000), "2 kg"],
  ])("écrit %j « %s »", (line, figure) => {
    expect(lineFigure(line)).toBe(figure);
  });

  it("écrit le poids plus petit que le nombre de pièces, la colonne restant la même", () => {
    expect(figureFontSize(pieces(1), 18)).toBe(18);
    expect(figureFontSize(grams(1), 18)).toBeLessThan(18);
    expect(figureFontSize(grams(1), 20)).toBe(12);
  });
});
