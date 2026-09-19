import { TAX_JOURNAL_SLICE } from "../activity-slice.js";

/**
 * La liste fermée de la tranche fiscale (plan du journal, lot 4). Épinglée :
 * l'élargir est une décision sur ce que la comptabilité peut lire, et elle doit
 * rougir un test plutôt que passer dans un diff de trois caractères.
 */
describe("TAX_JOURNAL_SLICE", () => {
  it("ne porte que la TVA et les règles comptables", () => {
    expect(TAX_JOURNAL_SLICE).toEqual({
      types: ["product_category.vat_changed", "product.vat_changed"],
      prefixes: ["vat_rate.", "accounting_rules."],
    });
  });

  it("n'ouvre ni les fiches ni les familles entières", () => {
    expect(TAX_JOURNAL_SLICE.prefixes).not.toContain("product.");
    expect(TAX_JOURNAL_SLICE.prefixes).not.toContain("product_category.");
  });
});
