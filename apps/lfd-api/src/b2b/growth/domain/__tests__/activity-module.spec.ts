import { moduleOf } from "../activity-module.js";

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
