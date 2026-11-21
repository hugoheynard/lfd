import { draftItemCount } from "../draft-item-count.js";

describe("draftItemCount", () => {
  it("compte les pièces, et une ligne au poids pour un article", () => {
    expect(
      draftItemCount([
        { sku: "VIE-001", quantity: 6 },
        { sku: "PAI-002", quantity: 2, saleUnit: "piece" },
        { sku: "FRO-003", quantity: 1500, saleUnit: "weight" },
      ]),
    ).toBe(9);
  });

  it("un brouillon sans ligne n'a aucun article", () => {
    expect(draftItemCount([])).toBe(0);
  });
});
