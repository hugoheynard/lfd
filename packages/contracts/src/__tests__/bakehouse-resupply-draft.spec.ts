import { bakehouseResupplyDraftLineSchema } from "../bakehouse-resupply-draft.js";

/** L'unité d'une ligne de brouillon du fournil (lot L2b-1 du plan du jour J). */
describe("bakehouseResupplyDraftLineSchema", () => {
  it("lit une ligne d'avant le lot, sans unité", () => {
    expect(bakehouseResupplyDraftLineSchema.parse({ sku: "CRO", quantity: 4 })).toEqual({
      sku: "CRO",
      quantity: 4,
    });
  });

  it("garde l'unité au poids, la quantité en grammes", () => {
    expect(
      bakehouseResupplyDraftLineSchema.parse({ sku: "SAU", quantity: 1250, saleUnit: "weight" }),
    ).toEqual({ sku: "SAU", quantity: 1250, saleUnit: "weight" });
  });

  it("refuse une unité inconnue", () => {
    expect(
      bakehouseResupplyDraftLineSchema.safeParse({ sku: "SAU", quantity: 1, saleUnit: "kilo" })
        .success,
    ).toBe(false);
  });
});
