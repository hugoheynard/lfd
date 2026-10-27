import type { VariantSnapshot } from "../../entities/variant.js";
import { activationGapsOf, isActivatable } from "../activation-gaps.js";
import {
  ALLERGEN_CONTRADICTION_SEVERITY,
  citedNotDeclared,
  isCompliantForActivation,
  productCompliance,
} from "../product-compliance.js";
import type { CompletenessRules } from "../variant-completeness.js";

function variant(over: Partial<VariantSnapshot>): VariantSnapshot {
  return {
    id: "var_1",
    sku: "PAIN-1",
    name: { fr: "Pain" },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: 450,
    weightGrams: null,
    proPriceMillicents: null,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    allergenSheet: { declared: [], mayContain: [] },
    nutrition: null,
    ...over,
  };
}

const ALL = { b2b: 5.5, takeaway: 5.5 };
const RULES: CompletenessRules = {
  activeContextKeys: ["b2b", "takeaway"],
  policy: { method: "ratio_ttc", ratioBp: 9_000 },
};

describe("productCompliance — le jugement unique d'une fiche", () => {
  it("ne rend aucun constat pour une fiche complète sans contradiction", () => {
    expect(productCompliance([variant({})], ALL, RULES, [])).toEqual([]);
  });

  it("bloque quand toutes les déclinaisons sont arrêtées", () => {
    const findings = productCompliance([variant({ isDiscontinued: true })], ALL, RULES, ["gluten"]);

    expect(findings).toEqual([{ code: "all_variants_discontinued", severity: "blocking" }]);
  });

  it("n'avertit que d'une déclinaison incomplète quand une autre est complète", () => {
    const findings = productCompliance(
      [variant({}), variant({ id: "var_2", sku: "PAIN-2", priceCents: null })],
      ALL,
      RULES,
      [],
    );

    expect(findings).toEqual([
      expect.objectContaining({ code: "variant_incomplete", severity: "warning", sku: "PAIN-2" }),
    ]);
    expect(isCompliantForActivation(findings)).toBe(true);
  });

  it("bloque chaque déclinaison incomplète quand aucune n'est complète", () => {
    const findings = productCompliance([variant({ priceCents: null })], ALL, RULES, []);

    expect(findings).toEqual([
      expect.objectContaining({
        code: "variant_incomplete",
        severity: "blocking",
        missing: ["price"],
      }),
    ]);
  });

  /**
   * Régression : le pain sans blé — « aucun allergène » déclaré, un ingrédient
   * qui porte le gluten — était activable (décision de Hugo, 2026-10-27).
   */
  it("rend non activable le pain sans blé qui déclare « aucun allergène » et cite le gluten", () => {
    const findings = productCompliance([variant({})], ALL, RULES, ["gluten"]);

    expect(findings).toEqual([
      {
        code: "allergens_contradict_none",
        severity: "blocking",
        variantId: "var_1",
        sku: "PAIN-1",
        allergenCodes: ["gluten"],
      },
    ]);
    expect(ALLERGEN_CONTRADICTION_SEVERITY).toBe("blocking");
    expect(isCompliantForActivation(findings)).toBe(false);
    expect(isActivatable(activationGapsOf(findings))).toBe(false);
  });

  it("nomme « cité non déclaré » quand la déclaration porte d'autres codes", () => {
    const findings = productCompliance(
      [variant({ allergenSheet: { declared: ["milk"], mayContain: [] } })],
      ALL,
      RULES,
      ["gluten", "milk"],
    );

    expect(findings).toEqual([
      expect.objectContaining({ code: "allergens_cited_not_declared", allergenCodes: ["gluten"] }),
    ]);
  });

  // D5 : sans déclaration, rien à comparer — le manque d'allergènes se dit déjà.
  it("ne compare pas une déclinaison sans déclaration", () => {
    const findings = productCompliance([variant({ allergenSheet: null })], ALL, RULES, ["gluten"]);

    expect(findings.map((finding) => finding.code)).toEqual(["variant_incomplete"]);
  });
});

describe("citedNotDeclared", () => {
  it("ne propose jamais de retrait, et rien sans déclaration", () => {
    expect(citedNotDeclared(["gluten", "milk"], ["gluten"])).toEqual([]);
    expect(citedNotDeclared(null, ["gluten"])).toEqual([]);
  });
});
