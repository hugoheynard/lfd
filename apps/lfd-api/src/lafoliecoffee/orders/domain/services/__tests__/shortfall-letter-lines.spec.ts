import { shortfallLetterLines } from "../shortfall-letter-lines.js";

const NAMES = new Map([
  ["CRO", "Croissant"],
  ["PAC", "Pain au chocolat"],
]);

describe("shortfallLetterLines — ce qui part et ce qui manque (E6d)", () => {
  it("fait partir ce qui était au bac, et manquer la différence avec le dû", () => {
    const lines = shortfallLetterLines(
      [
        { sku: "CRO", due: 3, packed: 1 },
        { sku: "PAC", due: 6, packed: 0 },
      ],
      NAMES,
    );

    expect(lines.departed).toEqual([{ product: "Croissant", quantity: 1 }]);
    expect(lines.missing).toEqual([
      { product: "Croissant", quantity: 2 },
      { product: "Pain au chocolat", quantity: 6 },
    ]);
  });

  it("ne dit pas manquant un article complet", () => {
    const lines = shortfallLetterLines([{ sku: "CRO", due: 2, packed: 2 }], NAMES);

    expect(lines).toEqual({ departed: [{ product: "Croissant", quantity: 2 }], missing: [] });
  });

  it("dit un article sans nom connu par son SKU plutôt que de le taire", () => {
    const lines = shortfallLetterLines([{ sku: "XYZ", due: 1, packed: 0 }], NAMES);

    expect(lines.missing).toEqual([{ product: "XYZ", quantity: 1 }]);
  });
});
