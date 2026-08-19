import { InvalidSkuError } from "../../errors/sku-errors.js";
import { Sku, SKU_MAX_LENGTH } from "../sku.value-object.js";

describe("Sku", () => {
  describe("normalisation", () => {
    it.each([
      ["ecl-choc-6p", "ECL-CHOC-6P"],
      ["  ecl-01  ", "ECL-01"],
      ["Tarte aux fraises", "TARTE-AUX-FRAISES"],
      ["crème brûlée", "CREME-BRULEE"],
      ["pain__de/mie", "PAIN-DE-MIE"],
      ["---ECL---01---", "ECL-01"],
    ])("%s → %s", (raw, expected) => {
      expect(Sku.create(raw).value).toBe(expected);
    });

    it("est idempotente", () => {
      const once = Sku.normalize("  Crème --- Brûlée  ");
      expect(Sku.normalize(once)).toBe(once);
    });

    // Le point du modèle : la valeur stockée étant toujours normalisée, un index
    // unique ORDINAIRE suffit à garantir l'unicité insensible à la casse.
    it("rend deux saisies équivalentes structurellement égales", () => {
      expect(Sku.create(" ecl-01 ").equals(Sku.create("ECL_01"))).toBe(true);
    });
  });

  describe("validation", () => {
    it.each([
      ["", "vide"],
      ["  ", "blanc"],
      ["AB", "trop court"],
      ["---", "que des séparateurs"],
      ["é", "diacritique seul, vide après normalisation"],
    ])("rejette « %s » (%s)", (raw) => {
      expect(() => Sku.create(raw)).toThrow(InvalidSkuError);
    });

    it("rejette au-delà de la longueur maximale", () => {
      expect(() => Sku.create("A".repeat(SKU_MAX_LENGTH + 1))).toThrow(InvalidSkuError);
    });

    it("accepte exactement la longueur maximale", () => {
      expect(Sku.create("A".repeat(SKU_MAX_LENGTH)).value).toHaveLength(SKU_MAX_LENGTH);
    });

    it("porte la catégorie « domain » et un code stable", () => {
      expect.assertions(2);
      try {
        Sku.create("!");
      } catch (error) {
        expect((error as InvalidSkuError).category).toBe("domain");
        expect((error as InvalidSkuError).code).toBe("catalogue.sku.invalid");
      }
    });
  });

  it("se compare par valeur, pas par référence", () => {
    expect(Sku.create("ECL-01").equals(Sku.create("ECL-01"))).toBe(true);
    expect(Sku.create("ECL-01").equals(Sku.create("ECL-02"))).toBe(false);
  });
});
