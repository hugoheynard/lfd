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

/** P6 de `pricing/vente-au-poids.md` : la ligne garde son unité. */
describe("linesBySku — au poids", () => {
  it("additionne les grammes d'un même article au poids, et garde l'unité", () => {
    expect(
      linesBySku([
        { sku: "SAU", productName: "Saumon gravlax", quantity: 500, saleUnit: "weight" as const },
        { sku: "CRO", productName: "Croissant", quantity: 12, saleUnit: "piece" as const },
        { sku: "SAU", productName: "Saumon gravlax", quantity: 750, saleUnit: "weight" as const },
      ]),
    ).toEqual([
      { sku: "SAU", productName: "Saumon gravlax", quantity: 1250, saleUnit: "weight" },
      { sku: "CRO", productName: "Croissant", quantity: 12, saleUnit: "piece" },
    ]);
  });

  it("refuse un même article à la pièce et au poids plutôt que d'additionner", () => {
    expect(() =>
      linesBySku([
        { sku: "SAU", productName: "Saumon", quantity: 2, saleUnit: "piece" as const },
        { sku: "SAU", productName: "Saumon", quantity: 500, saleUnit: "weight" as const },
      ]),
    ).toThrow(/à la fois à la pièce et au poids/u);
  });
});

/** Plan sur mesure, M4 : le marqueur d'un article regroupé. */
describe("linesBySku — le marqueur « sur mesure »", () => {
  const cro = { sku: "CRO", productName: "Croissant", quantity: 1 };

  it("un « oui » l'emporte sur un « non » et sur une ignorance", () => {
    expect(
      linesBySku([
        { ...cro, madeToOrder: null },
        { ...cro, madeToOrder: false },
        { ...cro, madeToOrder: true },
      ]),
    ).toEqual([{ ...cro, quantity: 3, madeToOrder: true }]);
  });

  it("un « non » connu l'emporte sur une ignorance", () => {
    expect(
      linesBySku([
        { ...cro, madeToOrder: null },
        { ...cro, madeToOrder: false },
      ]),
    ).toEqual([{ ...cro, quantity: 2, madeToOrder: false }]);
  });

  it("des lignes sans marqueur (réassort) restent sans marqueur", () => {
    expect(linesBySku([cro, cro])).toEqual([{ ...cro, quantity: 2 }]);
  });
});
