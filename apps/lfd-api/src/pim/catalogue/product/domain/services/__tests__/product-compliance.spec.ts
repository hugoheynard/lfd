import type { VariantSnapshot } from "../../entities/variant.js";
import { activationGapsOf, isActivatable } from "../activation-gaps.js";
import { isCompliantForActivation, productCompliance } from "../product-compliance.js";
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
    proPriceMillicents: 400_000,
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
   * qui porte le gluten — était REFUSÉ à l'activation le matin du 2026-10-27 ;
   * la contradiction est devenue une correction (`plan-allergenes-jamais-bloquants.md`).
   */
  it("le pain sans blé qui déclarait aucun allergène et citait le gluten se publie avec le gluten déclaré", () => {
    const findings = productCompliance([variant({})], ALL, RULES, ["gluten"]);

    expect(findings).toEqual([]);
    expect(isActivatable(activationGapsOf(findings))).toBe(true);
  });

  it("ne rend aucun constat quand la composition cite plus que la déclaration", () => {
    const findings = productCompliance(
      [variant({ allergenSheet: { declared: ["milk"], mayContain: [] } })],
      ALL,
      RULES,
      ["gluten", "milk"],
    );

    expect(findings).toEqual([]);
  });

  it("avertit d'une déclinaison sans déclaration, sans bloquer l'activation", () => {
    const findings = productCompliance([variant({ allergenSheet: null })], ALL, RULES, ["gluten"]);

    expect(findings).toEqual([
      { code: "allergens_precautionary", severity: "warning", variantId: "var_1", sku: "PAIN-1" },
    ]);
    expect(isCompliantForActivation(findings)).toBe(true);
  });

  it("ne traite pas « aucun allergène » comme une absence de déclaration", () => {
    const findings = productCompliance([variant({})], ALL, RULES, []);

    expect(findings.map((finding) => finding.code)).not.toContain("allergens_precautionary");
  });

  it("ne juge pas une déclinaison arrêtée sans déclaration", () => {
    const findings = productCompliance(
      [
        variant({}),
        variant({ id: "var_2", sku: "PAIN-2", isDiscontinued: true, allergenSheet: null }),
      ],
      ALL,
      RULES,
      [],
    );

    expect(findings).toEqual([]);
  });
});
