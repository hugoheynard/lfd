import { splitStaleUnitLines } from "../stale-unit-lines.js";

/** Le devis retire, sans convertir, une ligne d'une unité périmée (`plan-changer-l-unite-de-vente.md`, § 8). */

const ARTICLES = new Map([
  ["CRO", { name: "Croissant", saleUnit: "piece" as const }],
  ["VRC", { name: "Graines en vrac", saleUnit: "weight" as const }],
]);

describe("splitStaleUnitLines", () => {
  it("retire la ligne à la pièce d'un article passé au poids, avec son nom et sa nouvelle unité", () => {
    const split = splitStaleUnitLines(
      [
        { sku: "CRO", saleUnit: "piece" },
        { sku: "VRC", saleUnit: "piece" },
      ],
      ARTICLES,
    );

    expect(split.kept).toEqual([{ sku: "CRO", saleUnit: "piece" }]);
    expect(split.removed).toEqual([{ sku: "VRC", name: "Graines en vrac", saleUnit: "weight" }]);
  });

  it("garde une référence inconnue : son refus n'est pas celui-ci", () => {
    const split = splitStaleUnitLines([{ sku: "XXX", saleUnit: "piece" }], ARTICLES);

    expect(split.kept).toHaveLength(1);
    expect(split.removed).toEqual([]);
  });

  it("ne cite qu'une fois un article présent sur deux lignes", () => {
    const split = splitStaleUnitLines(
      [
        { sku: "VRC", saleUnit: "piece" },
        { sku: "VRC", saleUnit: "piece" },
      ],
      ARTICLES,
    );

    expect(split.removed).toHaveLength(1);
  });
});
