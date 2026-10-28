import { packingSaleUnitOf, StoredPackingSaleUnitUnknownError } from "../sale-unit.column.js";

/** La lecture de `packing_line.sale_unit` (P6) : jamais de repli silencieux sur `piece`. */
describe("packingSaleUnitOf", () => {
  it("lit les deux unités connues", () => {
    expect(packingSaleUnitOf("VIE-001", "piece")).toBe("piece");
    expect(packingSaleUnitOf("TRA-SAU", "weight")).toBe("weight");
  });

  it("refuse une unité inconnue en nommant l'article et la valeur", () => {
    expect(() => packingSaleUnitOf("TRA-SAU", "")).toThrow(StoredPackingSaleUnitUnknownError);
    expect(() => packingSaleUnitOf("TRA-SAU", "grams")).toThrow(/TRA-SAU.*« grams »/u);
  });
});
