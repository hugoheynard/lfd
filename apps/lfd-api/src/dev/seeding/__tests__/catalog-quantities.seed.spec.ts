import {
  ensureMinimumQuantity,
  ensureSaleQuantity,
} from "../../../b2b/orders/domain/services/sale-quantity-rules.js";
import { seedLineOf, type SeedSaleTerms } from "../catalog-quantities.seed.js";

const PIECE: SeedSaleTerms = {
  saleUnit: "piece",
  weightStepGrams: null,
  weightMinGrams: null,
  proMinQuantity: null,
  publicMinQuantity: null,
};

const WEIGHT: SeedSaleTerms = {
  ...PIECE,
  saleUnit: "weight",
  weightStepGrams: 50,
  weightMinGrams: 100,
};

/** Une ligne du semis, telle que la passation la juge — refuse si elle refuserait. */
function accepted(terms: SeedSaleTerms, base: number, clientele: "pro" | "public"): boolean {
  const line = seedLineOf("SKU-1", terms, base);
  if (line === null) {
    return false;
  }
  const saleUnit = terms.saleUnit === "weight" ? "weight" : "piece";
  ensureSaleQuantity(
    {
      sku: line.sku,
      saleUnit,
      weightMinGrams: terms.weightMinGrams,
      weightStepGrams: terms.weightStepGrams,
    },
    { quantity: line.quantity, saleUnit: line.saleUnit ?? "piece" },
  );
  ensureMinimumQuantity(
    {
      sku: line.sku,
      name: "article",
      saleUnit,
      minQuantity: clientele === "pro" ? terms.proMinQuantity : terms.publicMinQuantity,
    },
    line.quantity,
  );
  return true;
}

/**
 * Régression évitée (2026-10-29) : le sac long et le catalogue étalé prennent
 * leurs lignes dans TOUT le miroir, en pièces. Un article au poids ou sous
 * minimum y entrant, la passation aurait refusé la journée entière.
 */
describe("seedLineOf", () => {
  it("garde la quantité d'un article à la pièce sans minimum", () => {
    expect(seedLineOf("PAI-001", PIECE, 7)).toEqual({ sku: "PAI-001", quantity: 7 });
  });

  it("relève une quantité au plus grand des deux minimums, accepté des deux clientèles", () => {
    const terms = { ...PIECE, proMinQuantity: 10, publicMinQuantity: 2 };
    expect(seedLineOf("VIE-012", terms, 3)).toEqual({ sku: "VIE-012", quantity: 10 });
    expect(accepted(terms, 3, "pro")).toBe(true);
    expect(accepted(terms, 3, "public")).toBe(true);
  });

  it("compte un article au poids en grammes, multiple du pas", () => {
    expect(seedLineOf("SAL-025", WEIGHT, 7)).toEqual({
      sku: "SAL-025",
      quantity: 350,
      saleUnit: "weight",
    });
    expect(accepted(WEIGHT, 7, "pro")).toBe(true);
  });

  it("relève un poids trop petit au minimum, toujours sur le pas", () => {
    const terms = { ...WEIGHT, weightStepGrams: 30, weightMinGrams: 100 };
    expect(seedLineOf("SAL-028", terms, 1)?.quantity).toBe(120);
    expect(accepted(terms, 1, "public")).toBe(true);
  });

  it("ne pose aucune ligne sur un article au poids sans pas — la passation la refuserait", () => {
    expect(seedLineOf("SAL-099", { ...WEIGHT, weightStepGrams: null }, 5)).toBeNull();
  });
});
