import { JOURNAL_FACT_TYPES } from "@lfd/contracts/journal-facts";

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
  ])("%s se range sous %s", (type, module) => {
    expect(moduleOf(type)).toBe(module);
  });

  /** Le point fait partie du préfixe : `product.` ne capte pas `product_category.`. */
  it("garde les familles et les fiches sous le référentiel sans se confondre", () => {
    expect(moduleOf("product_category.vat_changed")).toBe("pim");
    expect(moduleOf("production_day.closed")).toBe("production");
  });
});

/** Les préfixes orphelins jusqu'au 2026-09-19 : le référentiel et l'heure limite d'un produit. */
describe("moduleOf — les orphelins rangés", () => {
  it.each([
    ["variant.added", "pim"],
    ["catalog_revision.pushed", "pim"],
    ["sales_context.updated", "pim"],
    ["appellation.created", "pim"],
    ["ingredient.allergens_saved", "pim"],
    ["allergen_category.renamed", "pim"],
    ["allergen_entry.updated", "pim"],
    ["order_time_limit.set", "commandes"],
  ])("%s se range sous %s", (type, module) => {
    expect(moduleOf(type)).toBe(module);
  });
});

/**
 * Le module de la comptabilité (Hugo, 2026-09-19) : l'entité émettrice et les
 * mandats SEPA sont son travail. Les règles comptables restent au référentiel,
 * à côté des taux.
 */
describe("moduleOf — la comptabilité", () => {
  it.each([
    ["legal_entity.declared", "comptabilite"],
    ["legal_entity.creditor_account_changed", "comptabilite"],
    ["legal_entity.mandate_scheme_changed", "comptabilite"],
    ["payment_mandate.minted", "comptabilite"],
    ["payment_mandate.signed", "comptabilite"],
    ["payment_mandate.revoked", "comptabilite"],
  ])("%s se range sous %s", (type, module) => {
    expect(moduleOf(type)).toBe(module);
  });

  it("le filtre du module ne ramène que ses deux préfixes", () => {
    expect(prefixesOf("comptabilite")).toEqual(["legal_entity.", "payment_mandate."]);
  });

  /** Le mandat a quitté les comptes clients ; le RIB du client, lui, y reste. */
  it("laisse le RIB d'une société cliente sous les comptes, sans le mandat", () => {
    expect(moduleOf("company.bank_account_changed")).toBe("comptes");
    expect(prefixesOf("comptes")).not.toContain("payment_mandate.");
  });

  it("garde les règles comptables au référentiel", () => {
    expect(moduleOf("accounting_rules.method_changed")).toBe("pim");
  });
});

/**
 * Régression : `feature_access.*` et `company_mercuriale.*` s'écrivaient sans
 * module — introuvables autrement qu'en fouillant « tous les modules » (relevé
 * au lot A du plan des phrases, rangés au lot B, 2026-09-19).
 */
describe("moduleOf — aucun type du catalogue sans module", () => {
  it.each([
    ["feature_access.override_set", "comptes"],
    ["feature_access.exemption_removed", "comptes"],
    ["company_mercuriale.posed", "commercial"],
    ["company_mercuriale.renamed", "commercial"],
  ])("%s se range sous %s", (type, module) => {
    expect(moduleOf(type)).toBe(module);
  });

  it("range chaque type du catalogue des faits, retirés compris", () => {
    expect(JOURNAL_FACT_TYPES.filter((type) => moduleOf(type) === null)).toEqual([]);
  });

  /** `company.` ne doit pas capter `company_mercuriale.` : le point fait partie du préfixe. */
  it("ne confond pas la mercuriale d'un client avec son compte", () => {
    expect(moduleOf("company.declared")).toBe("comptes");
    expect(moduleOf("company_mercuriale.archived")).toBe("commercial");
  });
});
