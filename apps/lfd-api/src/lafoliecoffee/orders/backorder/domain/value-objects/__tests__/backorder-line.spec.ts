import { InvalidBackorderLineError } from "../../errors/backorder-errors.js";
import { BackorderLine } from "../backorder-line.js";

describe("BackorderLine", () => {
  it("garde un reste en pièces", () => {
    const line = BackorderLine.of({ sku: "VIE-001-1", quantity: 3, saleUnit: "piece" });

    expect({ sku: line.sku, quantity: line.quantity, saleUnit: line.saleUnit }).toEqual({
      sku: "VIE-001-1",
      quantity: 3,
      saleUnit: "piece",
    });
  });

  it("garde un reste au poids, en grammes", () => {
    const line = BackorderLine.of({ sku: "PAI-010-1", quantity: 1250, saleUnit: "weight" });

    expect(line.quantity).toBe(1250);
    expect(line.saleUnit).toBe("weight");
  });

  it("rogne les espaces de l'article", () => {
    expect(BackorderLine.of({ sku: "  VIE-001-1 ", quantity: 1, saleUnit: "piece" }).sku).toBe(
      "VIE-001-1",
    );
  });

  it.each([
    ["un article vide", { sku: " ", quantity: 1, saleUnit: "piece" }],
    ["une quantité nulle", { sku: "VIE-001-1", quantity: 0, saleUnit: "piece" }],
    ["une quantité négative", { sku: "VIE-001-1", quantity: -2, saleUnit: "piece" }],
    ["une quantité non entière", { sku: "VIE-001-1", quantity: 1.5, saleUnit: "weight" }],
    ["une quantité non finie", { sku: "VIE-001-1", quantity: Number.NaN, saleUnit: "piece" }],
    [
      "une quantité infinie",
      { sku: "VIE-001-1", quantity: Number.POSITIVE_INFINITY, saleUnit: "piece" },
    ],
    ["un article d'espaces et de tabulations", { sku: "\t \n", quantity: 1, saleUnit: "piece" }],
    ["une unité vide", { sku: "VIE-001-1", quantity: 1, saleUnit: "" }],
    ["une unité à la casse près", { sku: "VIE-001-1", quantity: 1, saleUnit: "Piece" }],
    ["une unité inconnue", { sku: "VIE-001-1", quantity: 1, saleUnit: "litre" }],
  ])("refuse %s", (_case, input) => {
    expect(() => BackorderLine.of(input)).toThrow(InvalidBackorderLineError);
  });

  // La plus petite quantité admise est 1 : 1 pièce, ou 1 gramme au poids.
  it("admet la borne basse, 1", () => {
    expect(BackorderLine.of({ sku: "X", quantity: 1, saleUnit: "weight" }).quantity).toBe(1);
  });
});
