import { shelfLeftFor, type ShelfServedArticle } from "../shelf-left-today.js";

const PIECE: ShelfServedArticle = { saleUnit: "piece" };
const WEIGHT: ShelfServedArticle = { saleUnit: "weight" };

describe("shelfLeftFor — ce que la vitrine annonce à un appelant", () => {
  it("rend le reste des articles servis, en grammes au poids", () => {
    const left = shelfLeftFor(
      [
        { sku: "VIE-001", saleUnit: "piece", estimatedStock: 3 },
        { sku: "PAI-010", saleUnit: "weight", estimatedStock: 1200 },
      ],
      new Map([
        ["VIE-001", PIECE],
        ["PAI-010", WEIGHT],
      ]),
    );

    expect(left).toEqual([
      { sku: "VIE-001", saleUnit: "piece", left: 3 },
      { sku: "PAI-010", saleUnit: "weight", left: 1200 },
    ]);
  });

  it("tait un article que le catalogue ne sert pas à cet appelant", () => {
    expect(
      shelfLeftFor([{ sku: "SUR-001", saleUnit: "piece", estimatedStock: 5 }], new Map()),
    ).toEqual([]);
  });

  it("tait un reste nul ou négatif : rien en vitrine", () => {
    const served = new Map([["VIE-001", PIECE]]);

    expect(
      shelfLeftFor([{ sku: "VIE-001", saleUnit: "piece", estimatedStock: 0 }], served),
    ).toEqual([]);
    expect(
      shelfLeftFor([{ sku: "VIE-001", saleUnit: "piece", estimatedStock: -2 }], served),
    ).toEqual([]);
  });

  it("tait un reste dans une autre unité que celle où l'article se vend", () => {
    expect(
      shelfLeftFor(
        [{ sku: "PAI-010", saleUnit: "weight", estimatedStock: 800 }],
        new Map([["PAI-010", PIECE]]),
      ),
    ).toEqual([]);
  });
});
