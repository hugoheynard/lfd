import { bakedBySku } from "../scenario-facts.reader.js";

describe("bakedBySku — ce qui est sorti, par SKU", () => {
  it("déduit la part corrigée des fournées (`fournil/les-niveaux-de-suivi.md`)", () => {
    const baked = bakedBySku([
      { sku: "VIE-001-1", _sum: { quantity: 24, correctedQuantity: 9 } },
      { sku: "PAI-001-1", _sum: { quantity: 12, correctedQuantity: 0 } },
    ]);

    expect(baked.get("VIE-001-1")).toBe(15);
    expect(baked.get("PAI-001-1")).toBe(12);
  });

  it("une somme vide vaut zéro", () => {
    expect(
      bakedBySku([{ sku: "VIE-001-1", _sum: { quantity: null, correctedQuantity: null } }]).get(
        "VIE-001-1",
      ),
    ).toBe(0);
  });
});
