import { linesBySku } from "../lines-by-sku.js";

describe("linesBySku", () => {
  it("additionne les lignes d'un même article, garde le premier nom", () => {
    expect(
      linesBySku([
        { sku: "CRO", productName: "Croissant", quantity: 2 },
        { sku: "PAI", productName: "Pain", quantity: 1 },
        { sku: "CRO", productName: "Croissant beurre", quantity: 3 },
      ]),
    ).toEqual([
      { sku: "CRO", productName: "Croissant", quantity: 5 },
      { sku: "PAI", productName: "Pain", quantity: 1 },
    ]);
  });

  it("aucune ligne, aucune ligne", () => {
    expect(linesBySku([])).toEqual([]);
  });
});
