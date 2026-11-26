import { InvalidRecapQuantityError } from "../../errors/in-house-recap-errors.js";
import { aggregateRecapLines, type RecapSourceNote } from "../recap-aggregation.js";

const AT = Date.parse("2026-10-10T08:00:00.000Z");
const HOUR = 3600 * 1000;

function note(
  number: string,
  hoursLater: number,
  lines: RecapSourceNote["lines"],
): RecapSourceNote {
  return {
    deliveryNoteId: `dn-${number}`,
    number,
    handedOverAt: new Date(AT + hoursLater * HOUR),
    contentVersion: 1,
    lines,
  };
}

const line = (sku: string, productName: string, quantity: number, saleUnit = "piece") => ({
  sku,
  productName,
  saleUnit,
  quantity,
});

describe("aggregateRecapLines — par (sku, unité de vente)", () => {
  it("somme un produit sur tous les BL", () => {
    const lines = aggregateRecapLines([
      note("BL-1", 0, [line("CROI", "Croissant", 10), line("PAIN", "Pain", 2)]),
      note("BL-2", 24, [line("CROI", "Croissant", 5)]),
    ]);
    expect(lines).toEqual([line("CROI", "Croissant", 15), line("PAIN", "Pain", 2)]);
  });

  it("deux unités de vente d'un même produit ne s'additionnent pas", () => {
    const lines = aggregateRecapLines([
      note("BL-1", 0, [line("BRIO", "Brioche", 3, "piece"), line("BRIO", "Brioche", 2, "kg")]),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.map((one) => one.saleUnit).sort()).toEqual(["kg", "piece"]);
  });

  it("le nom est celui du BL remis le plus tard, quel que soit l'ordre de lecture", () => {
    const early = note("BL-9", 0, [line("CROI", "Croissant ancien", 1)]);
    const late = note("BL-2", 48, [line("CROI", "Croissant au beurre", 1)]);
    expect(aggregateRecapLines([early, late])[0]?.productName).toBe("Croissant au beurre");
    expect(aggregateRecapLines([late, early])[0]?.productName).toBe("Croissant au beurre");
  });

  it("à remise égale, le plus grand numéro départage — numériquement", () => {
    const nine = note("BL-9", 0, [line("CROI", "Nom du 9", 1)]);
    const ten = note("BL-10", 0, [line("CROI", "Nom du 10", 1)]);
    expect(aggregateRecapLines([ten, nine])[0]?.productName).toBe("Nom du 10");
    expect(aggregateRecapLines([nine, ten])[0]?.productName).toBe("Nom du 10");
  });

  it("un total nul ne dit rien et sort ; aucune ligne pour aucun BL", () => {
    expect(aggregateRecapLines([note("BL-1", 0, [line("CROI", "Croissant", 0)])])).toEqual([]);
    expect(aggregateRecapLines([])).toEqual([]);
  });

  it("refuse une quantité négative ou non entière, en nommant le BL", () => {
    expect(() => aggregateRecapLines([note("BL-7", 0, [line("CROI", "Croissant", -1)])])).toThrow(
      InvalidRecapQuantityError,
    );
    expect(() => aggregateRecapLines([note("BL-7", 0, [line("CROI", "Croissant", 1.5)])])).toThrow(
      /BL-7/,
    );
  });

  it("trie par nom, puis sku", () => {
    const lines = aggregateRecapLines([
      note("BL-1", 0, [line("Z", "Baguette", 1), line("A", "Éclair", 1), line("B", "Baguette", 1)]),
    ]);
    expect(lines.map((one) => one.sku)).toEqual(["B", "Z", "A"]);
  });
});
