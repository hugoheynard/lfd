import { productionSaleUnitOf, StoredProductionSaleUnitUnknownError } from "../sale-unit.column.js";

/** La lecture de `sale_unit` au fournil (P6) : jamais de repli silencieux sur `piece`. */
describe("productionSaleUnitOf", () => {
  it("lit les deux unités connues", () => {
    expect(productionSaleUnitOf("VIE-001", "piece")).toBe("piece");
    expect(productionSaleUnitOf("TRA-SAU", "weight")).toBe("weight");
  });

  it("refuse une unité inconnue en nommant l'article et la valeur", () => {
    expect(() => productionSaleUnitOf("TRA-SAU", "kg")).toThrow(
      StoredProductionSaleUnitUnknownError,
    );
    expect(() => productionSaleUnitOf("TRA-SAU", "kg")).toThrow(/TRA-SAU.*« kg »/u);
  });
});
