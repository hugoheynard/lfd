import { QuantityBelowMinimumError } from "../../errors/sale-quantity-errors.js";
import type { OrderLineSnapshot } from "../../value-objects/order-line.js";
import { ensureKeptMinimums, keptQuantityChanges, revisedLineRequests } from "../revised-lines.js";

/**
 * Dérogation à R3, décidée par Hugo le 2026-10-29
 * (`documentation/catalogue/plan-quantite-minimale.md`, M4) : une ligne gardée
 * dont la quantité change se tient au minimum que le catalogue publie.
 */

function snapshot(
  sku: string,
  quantity: number,
  saleUnit: "piece" | "weight" = "piece",
): OrderLineSnapshot {
  return {
    sku,
    productName: `Article ${sku}`,
    unitPriceMillicents: 200_000,
    vatRate: 5.5,
    saleUnit,
    quantity,
    lineTotalCents: 0,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pricing: null,
    allergens: null,
    pickupDiscountEligible: false,
    productId: null,
    categoryId: null,
  };
}

describe("keptQuantityChanges", () => {
  it("ne rend que les lignes gardées dont la quantité change", () => {
    const previous = [snapshot("VIE-001", 10), snapshot("PAI-001", 3)];
    const split = revisedLineRequests(previous, [
      { sku: "VIE-001", quantity: 5 },
      { sku: "PAI-001", quantity: 3 },
      { sku: "NEW-001", quantity: 1 },
    ]);

    expect(keptQuantityChanges(previous, split)).toEqual([
      { sku: "VIE-001", productName: "Article VIE-001", saleUnit: "piece", quantity: 5 },
    ]);
  });

  it("lit la quantité FUSIONNÉE d'un SKU cité deux fois", () => {
    const previous = [snapshot("VIE-001", 10)];
    const split = revisedLineRequests(previous, [
      { sku: "VIE-001", quantity: 5 },
      { sku: "VIE-001", quantity: 5 },
    ]);

    expect(keptQuantityChanges(previous, split)).toEqual([]);
  });

  it("ignore une ligne retirée", () => {
    const previous = [snapshot("VIE-001", 10)];
    const split = revisedLineRequests(previous, [{ sku: "PAI-001", quantity: 1 }]);

    expect(keptQuantityChanges(previous, split)).toEqual([]);
  });
});

describe("ensureKeptMinimums", () => {
  const baissee = (quantity: number, saleUnit: "piece" | "weight" = "piece") => [
    { sku: "VIE-001", productName: "Croissant", saleUnit, quantity },
  ];

  it("refuse une ligne baissée sous le minimum", () => {
    expect(() => {
      ensureKeptMinimums(baissee(5), new Map([["VIE-001", 6]]));
    }).toThrow(QuantityBelowMinimumError);
  });

  it("laisse passer une ligne baissée jusqu'au minimum", () => {
    expect(() => {
      ensureKeptMinimums(baissee(6), new Map([["VIE-001", 6]]));
    }).not.toThrow();
  });

  it("laisse passer un article sans minimum", () => {
    expect(() => {
      ensureKeptMinimums(baissee(1), new Map([["VIE-001", null]]));
    }).not.toThrow();
  });

  it("laisse passer un article sorti du catalogue : aucun minimum connu", () => {
    expect(() => {
      ensureKeptMinimums(baissee(1), new Map());
    }).not.toThrow();
  });

  it("ne tient pas un article au poids au minimum en pièces", () => {
    expect(() => {
      ensureKeptMinimums(baissee(500, "weight"), new Map([["VIE-001", 6]]));
    }).not.toThrow();
  });
});
