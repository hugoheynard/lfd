import { StoredSaleUnitUnknownError, saleUnitOf } from "../catalog-sale-unit.js";

describe("saleUnitOf — la colonne `sale_unit` lue dans les mots du domaine", () => {
  it("lit les deux unités connues", () => {
    expect(saleUnitOf("VIE-1-1", "piece")).toBe("piece");
    expect(saleUnitOf("GRA-1-1", "weight")).toBe("weight");
  });

  /** Un article au poids lu à la pièce se facturerait faux : refuser, jamais replier. */
  it("refuse une valeur inconnue, en nommant l'article", () => {
    expect(() => saleUnitOf("GRA-1-1", "kg")).toThrow(StoredSaleUnitUnknownError);
    expect(() => saleUnitOf("GRA-1-1", "kg")).toThrow(/GRA-1-1/u);
  });
});
