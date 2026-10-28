import type { OrderLineSnapshot } from "../../value-objects/order-line.js";
import { revisedLineRequests } from "../revised-lines.js";

/**
 * R3 du plan de modification (`documentation/commandes/modification/plan-modifier-une-commande.md`) :
 * une ligne déjà présente garde son prix, une ligne nouvelle part au prix du jour.
 */

function snapshot(sku: string, unitPriceMillicents: number): OrderLineSnapshot {
  return {
    sku,
    productName: `Article ${sku}`,
    unitPriceMillicents,
    vatRate: 5.5,
    saleUnit: "piece",
    quantity: 3,
    lineTotalCents: 0,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pricing: null,
    allergens: null,
    pickupDiscountEligible: false,
    productId: "prod_old",
    categoryId: "cat_old",
  };
}

describe("revisedLineRequests", () => {
  it("garde le prix et le taux d'une ligne déjà présente, à sa nouvelle quantité", () => {
    const split = revisedLineRequests(
      [snapshot("VIE-001", 123_450)],
      [{ sku: "VIE-001", quantity: 8 }],
    );

    expect(split.fresh).toEqual([]);
    expect(split.frozen.get("VIE-001")).toEqual({
      sku: "VIE-001",
      productName: "Article VIE-001",
      unitPriceMillicents: 123_450,
      vatRate: 5.5,
      saleUnit: "piece",
      quantity: 8,
      pricing: null,
      allergens: null,
    });
  });

  it("n'emporte ni l'éligibilité ni le rangement d'avant : ils se recalculent (R4)", () => {
    const frozen = revisedLineRequests(
      [snapshot("VIE-001", 1)],
      [{ sku: "VIE-001", quantity: 1 }],
    ).frozen.get("VIE-001");

    expect(frozen).not.toHaveProperty("pickupDiscountEligible");
    expect(frozen).not.toHaveProperty("productId");
  });

  it("envoie une ligne nouvelle au prix du jour", () => {
    const split = revisedLineRequests([snapshot("VIE-001", 1)], [{ sku: "PAI-001", quantity: 2 }]);

    expect(split.fresh).toEqual([{ sku: "PAI-001", quantity: 2, saleUnit: "piece" }]);
    expect(split.frozen.size).toBe(0);
  });

  it("fusionne les quantités d'un même SKU, et garde l'ordre de la demande", () => {
    const split = revisedLineRequests(
      [snapshot("VIE-001", 1)],
      [
        { sku: "PAI-001", quantity: 1 },
        { sku: "VIE-001", quantity: 2 },
        { sku: "PAI-001", quantity: 3 },
      ],
    );

    expect(split.order).toEqual(["PAI-001", "VIE-001"]);
    expect(split.fresh).toEqual([{ sku: "PAI-001", quantity: 4, saleUnit: "piece" }]);
  });
});
