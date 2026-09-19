import { TAX_JOURNAL_SLICE } from "../activity-slice.js";

/**
 * La liste fermée de la tranche fiscale (plan du journal, lot 4). Épinglée :
 * l'élargir est une décision sur ce que la comptabilité peut lire, et elle doit
 * rougir un test plutôt que passer dans un diff de trois caractères.
 */
describe("TAX_JOURNAL_SLICE", () => {
  /** « Tout ce qui touche au taux » (Hugo, 2026-09-19). */
  it("porte la TVA, le reclassement, les règles comptables, les contextes de vente et la surtaxe", () => {
    expect(TAX_JOURNAL_SLICE).toEqual({
      types: ["product_category.vat_changed", "product.vat_changed", "product.reclassified"],
      prefixes: ["vat_rate.", "accounting_rules.", "sales_context.", "order_late_fee."],
    });
  });

  it("n'ouvre ni les fiches ni les familles entières", () => {
    expect(TAX_JOURNAL_SLICE.prefixes).not.toContain("product.");
    expect(TAX_JOURNAL_SLICE.prefixes).not.toContain("product_category.");
  });

  /** Le point fait partie du préfixe : `order_late_fee.` ne capte pas les dérogations. */
  it("n'ouvre pas les dérogations d'heure limite avec la surtaxe", () => {
    const covered = (type: string): boolean =>
      TAX_JOURNAL_SLICE.types.includes(type) ||
      TAX_JOURNAL_SLICE.prefixes.some((prefix) => type.startsWith(prefix));

    expect(covered("order_late_fee.set")).toBe(true);
    expect(covered("order_cutoff_waiver.granted")).toBe(false);
    expect(covered("order.placed")).toBe(false);
  });

  /**
   * Le reclassement entre par son fait dédié, jamais par le diff d'identité
   * qui porte aussi le `categoryId` : chaque nom retouché inonderait la tranche.
   */
  it("prend le reclassement d'une fiche sans prendre la sauvegarde de son identité", () => {
    expect(TAX_JOURNAL_SLICE.types).toContain("product.reclassified");
    expect(TAX_JOURNAL_SLICE.types).not.toContain("product.identity_saved");
    expect(TAX_JOURNAL_SLICE.types).not.toContain("product.channels_changed");
  });
});
