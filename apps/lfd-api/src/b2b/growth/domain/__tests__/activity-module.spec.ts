import { moduleOf, prefixesOf } from "../activity-module.js";

/**
 * Le rangement des faits de l'argent (lot 1 du plan du journal, 2026-09-19).
 * Un fait sans module ne se retrouve qu'en fouillant « tous les modules ».
 */
describe("moduleOf — les faits de l'argent", () => {
  it.each([
    ["order_late_fee.set", "commandes"],
    ["order_late_fee.cleared", "commandes"],
    ["order_cutoff_waiver.granted", "commandes"],
    ["order_cutoff_waiver.revoked", "commandes"],
    ["company.bank_account_changed", "comptes"],
  ])("%s se range sous %s", (type, module) => {
    expect(moduleOf(type)).toBe(module);
  });

  /** Le point fait partie du préfixe : `order_cutoff.` ne couvre pas les dérogations. */
  it("garde les heures limites elles-mêmes sous commandes", () => {
    expect(moduleOf("order_cutoff.created")).toBe("commandes");
  });
});

/** Les décisions de catalogue (tranche (b) du lot 1, 2026-09-19). */
describe("moduleOf — les décisions de catalogue", () => {
  it.each([
    ["catalog_item.b2b_price_set", "commercial"],
    ["catalog_item.b2b_price_cleared", "commercial"],
    ["catalog_item.hidden", "commercial"],
    ["catalog_item.shown", "commercial"],
    ["catalog_item.featured", "commercial"],
    ["catalog_item.unfeatured", "commercial"],
    ["catalog_delivery.accepted", "commercial"],
  ])("%s se range sous %s", (type, module) => {
    expect(moduleOf(type)).toBe(module);
  });
});

/**
 * Les gestes du client sur son compte et ses paniers récurrents (tranche (c)
 * du lot 1, 2026-09-19) : aucun préfixe neuf, tous déjà rangés sous comptes.
 */
describe("moduleOf — les gestes du client sur son compte", () => {
  it.each([
    ["subscription.status_changed", "comptes"],
    ["subscription.occurrence_overridden", "comptes"],
    ["subscription.deleted", "comptes"],
    ["company.identity_edited", "comptes"],
    ["company.payment_term_requested", "comptes"],
    ["company.access_opened", "comptes"],
    ["user.profile_updated", "comptes"],
    ["user.password_link_issued", "comptes"],
  ])("%s se range sous %s", (type, module) => {
    expect(moduleOf(type)).toBe(module);
  });
});

/** La journée de production et ses contenants (tranche (d) du lot 1, 2026-09-19). */
describe("moduleOf — le fournil", () => {
  it.each([
    ["production_day.closed", "production"],
    ["production_day.retaken", "production"],
    ["production_container.set", "production"],
    ["production_container.removed", "production"],
  ])("%s se range sous %s", (type, module) => {
    expect(moduleOf(type)).toBe(module);
  });

  it("le filtre du module production ne ramène que ses deux préfixes", () => {
    expect(prefixesOf("production")).toEqual(["production_day.", "production_container."]);
  });
});

/**
 * Les préfixes orphelins (plan du journal, lot 4, 2026-09-19) : un fait sans
 * module ne se retrouve qu'en fouillant « tous les modules ».
 */
describe("moduleOf — les préfixes qui n'étaient rangés nulle part", () => {
  it.each([
    ["accounting_rules.pro_ratio_changed", "pim"],
    ["accounting_rules.method_changed", "pim"],
    ["point_of_sale.created", "pim"],
    ["point_of_sale.table_qr_generated", "pim"],
    ["payment_mandate.signed", "comptes"],
    ["payment_mandate.revoked", "comptes"],
  ])("%s se range sous %s", (type, module) => {
    expect(moduleOf(type)).toBe(module);
  });

  /** Notre entité émettrice n'est pas un compte client : elle attend sa décision. */
  it("laisse l'entité émettrice hors de tout module", () => {
    expect(moduleOf("legal_entity.creditor_account_changed")).toBeNull();
  });

  /** Le point fait partie du préfixe : `product.` ne capte pas `product_category.`. */
  it("garde les familles et les fiches sous le référentiel sans se confondre", () => {
    expect(moduleOf("product_category.vat_changed")).toBe("pim");
    expect(moduleOf("production_day.closed")).toBe("production");
  });
});
