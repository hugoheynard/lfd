import { QuantityBelowMinimumError } from "../../../domain/errors/sale-quantity-errors.js";
import { catalogItem, quotingOf, type QuotingSetup } from "./shop-cart-quoting.doubles.js";

/**
 * **Le devis contre la quantité minimale d'achat** —
 * `documentation/catalogue/plan-quantite-minimale.md`, Q5 : chaque clientèle
 * son minimum, lu sur le TOTAL d'un SKU, refusé avant la passation par la même
 * règle qu'elle (`OrderLinePricing`, que la passation emprunte aussi).
 */

/** Le croissant : par 6 au moins pour un pro, par 4 pour un particulier. */
const CROISSANT = {
  ...catalogItem("VIE-001", "Croissant", 200_000, 5.5),
  minQuantities: { pro: 6, public: 4 },
};
/** Le saumon au poids : un minimum en pièces ne le concerne pas. */
const SALMON = {
  ...catalogItem("SAU-001", "Saumon gravlax", 1_234_567, 5.5),
  saleUnit: "weight" as const,
  weightMinGrams: null,
  weightStepGrams: 50,
  minQuantities: { pro: 6, public: 4 },
};

const PRO = { companyId: "co_pro", buyerUserId: "user_pro" } as const;
const NO_COMPANY = { companyId: null, buyerUserId: null } as const;

function quoting(over: Partial<QuotingSetup> = {}) {
  return quotingOf({ catalog: [CROISSANT, SALMON], companyStatus: "active", ...over });
}

function croissants(quantity: number) {
  return { sku: "VIE-001", quantity };
}

describe("ShopCartQuoting — la quantité minimale", () => {
  it("refuse un pro sous SON minimum, même au minimum des particuliers", async () => {
    const refusal = quoting().quote({
      ...PRO,
      payload: { lines: [croissants(4)], fulfillment: null },
    });

    await expect(refusal).rejects.toThrow(QuantityBelowMinimumError);
    await expect(refusal).rejects.toMatchObject({ minimum: 6, quantity: 4 });
  });

  it("chiffre un pro à son minimum", async () => {
    const { view } = await quoting().quote({
      ...PRO,
      payload: { lines: [croissants(6)], fulfillment: null },
    });

    expect(view.lines).toEqual([expect.objectContaining({ sku: "VIE-001", quantity: 6 })]);
  });

  it("tient un particulier à SON minimum, pas à celui des pros", async () => {
    const pricing = quoting({ companyStatus: null });

    await expect(
      pricing.quote({ ...NO_COMPANY, payload: { lines: [croissants(3)], fulfillment: null } }),
    ).rejects.toThrow(QuantityBelowMinimumError);
    const { view } = await pricing.quote({
      ...NO_COMPANY,
      payload: { lines: [croissants(4)], fulfillment: null },
    });
    expect(view.lines[0]).toMatchObject({ quantity: 4 });
  });

  it("lit le total du SKU : deux lignes de 3 font les 6 du minimum", async () => {
    const { view } = await quoting().quote({
      ...PRO,
      payload: { lines: [croissants(3), croissants(3)], fulfillment: null },
    });

    expect(view.lines[0]).toMatchObject({ sku: "VIE-001", quantity: 6 });
  });

  it("n'oppose aucun minimum en pièces à une ligne au poids", async () => {
    const { view } = await quoting().quote({
      ...PRO,
      payload: {
        lines: [{ sku: "SAU-001", quantity: 100, saleUnit: "weight" }],
        fulfillment: null,
      },
    });

    expect(view.lines[0]).toMatchObject({ sku: "SAU-001", quantity: 100 });
  });
});
