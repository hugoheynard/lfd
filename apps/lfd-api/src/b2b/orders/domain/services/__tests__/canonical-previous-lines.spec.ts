import type { OrderLineSnapshot } from "../../value-objects/order-line.js";
import { canonicalPreviousLines } from "../canonical-previous-lines.js";

function line(sku: string, quantity: number, unitPriceMillicents: number): OrderLineSnapshot {
  return {
    sku,
    productName: "Pain",
    unitPriceMillicents,
    vatRate: 5.5,
    quantity,
    saleUnit: "piece",
    lineTotalCents: 0,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pricing: null,
    allergens: null,
    pickupDiscountEligible: true,
    productId: null,
    categoryId: null,
  };
}

const canonical = (sku: string): string => (sku === "PAI-001" ? "PAI-001-1" : sku);

/** `plan-defaut-sous-sa-reference.md`, § 6 : la révision précédente lue sous la cible. */
describe("canonicalPreviousLines", () => {
  it("lit une ancienne référence sous sa cible, à son prix", () => {
    expect(canonicalPreviousLines([line("PAI-001", 3, 100)], canonical)).toEqual([
      line("PAI-001-1", 3, 100),
    ]);
  });

  it("fusionne les deux graphies, la ligne de la cible l'emportant quel que soit l'ordre", () => {
    const expected = [line("PAI-001-1", 5, 200)];
    expect(
      canonicalPreviousLines([line("PAI-001", 3, 100), line("PAI-001-1", 2, 200)], canonical),
    ).toEqual(expected);
    expect(
      canonicalPreviousLines([line("PAI-001-1", 2, 200), line("PAI-001", 3, 100)], canonical),
    ).toEqual(expected);
  });

  it("laisse les autres lignes telles quelles", () => {
    expect(canonicalPreviousLines([line("VIE-001-1", 1, 50)], canonical)).toEqual([
      line("VIE-001-1", 1, 50),
    ]);
  });
});
