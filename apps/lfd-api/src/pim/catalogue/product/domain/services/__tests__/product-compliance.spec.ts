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
    expect(productCompliance([variant({})], ALL, RULES, [], "both")).toEqual([]);
  });

  it("bloque quand toutes les déclinaisons sont arrêtées", () => {
    const findings = productCompliance(
      [variant({ isDiscontinued: true })],
      ALL,
      RULES,
      ["gluten"],
      "both",
    );

    expect(findings).toEqual([{ code: "all_variants_discontinued", severity: "blocking" }]);
  });

  it("n'avertit que d'une déclinaison incomplète quand une autre est complète", () => {
    const findings = productCompliance(
      [variant({}), variant({ id: "var_2", sku: "PAIN-2", priceCents: null })],
      ALL,
      RULES,
      [],
      "public",
    );

    expect(findings).toEqual([
      expect.objectContaining({ code: "variant_incomplete", severity: "warning", sku: "PAIN-2" }),
    ]);
    expect(isCompliantForActivation(findings)).toBe(true);
  });

  it("bloque chaque déclinaison incomplète quand aucune n'est complète", () => {
    const findings = productCompliance([variant({ priceCents: null })], ALL, RULES, [], "public");

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
    const findings = productCompliance([variant({})], ALL, RULES, ["gluten"], "both");

    expect(findings).toEqual([]);
    expect(isActivatable(activationGapsOf(findings))).toBe(true);
  });

  it("ne rend aucun constat quand la composition cite plus que la déclaration", () => {
    const findings = productCompliance(
      [variant({ allergenSheet: { declared: ["milk"], mayContain: [] } })],
      ALL,
      RULES,
      ["gluten", "milk"],
      "both",
    );

    expect(findings).toEqual([]);
  });

  it("avertit d'une déclinaison sans déclaration, sans bloquer l'activation", () => {
    const findings = productCompliance(
      [variant({ allergenSheet: null })],
      ALL,
      RULES,
      ["gluten"],
      "both",
    );

    expect(findings).toEqual([
      { code: "allergens_precautionary", severity: "warning", variantId: "var_1", sku: "PAIN-1" },
    ]);
    expect(isCompliantForActivation(findings)).toBe(true);
  });

  it("ne traite pas « aucun allergène » comme une absence de déclaration", () => {
    const findings = productCompliance([variant({})], ALL, RULES, [], "both");

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
      "both",
    );

    expect(findings).toEqual([]);
  });
});

/** `plan-prix-manquant-non-bloquant.md` (2026-10-27) : un prix manquant se signale. */
describe("productCompliance — le prix d'une audience manque", () => {
  it.each([
    ["pro", { proPriceMillicents: null }],
    ["public", { priceCents: null }],
  ] as const)("avertit qu'une fiche « les deux » ne se vend pas aux %s", (audience, over) => {
    const findings = productCompliance([variant(over)], ALL, RULES, [], "both");

    expect(findings).toEqual([
      {
        code: "price_missing_for_audience",
        severity: "warning",
        variantId: "var_1",
        sku: "PAIN-1",
        audience,
      },
    ]);
    expect(isCompliantForActivation(findings)).toBe(true);
  });

  it("ne le dit pas d'une fiche qui ne vise qu'une audience", () => {
    expect(
      productCompliance([variant({ proPriceMillicents: null })], ALL, RULES, [], "public"),
    ).toEqual([]);
    expect(productCompliance([variant({ priceCents: null })], ALL, RULES, [], "pro")).toEqual([]);
  });

  it("sans aucun prix, une seule ligne : `variant_incomplete`, pas une seconde", () => {
    const findings = productCompliance(
      [variant({ priceCents: null, proPriceMillicents: null })],
      ALL,
      RULES,
      [],
      "both",
    );

    expect(findings.map((finding) => finding.code)).toEqual(["variant_incomplete"]);
    expect(findings[0]).toMatchObject({ missing: ["price", "pro_price"], severity: "blocking" });
  });

  it("ne juge pas une déclinaison arrêtée", () => {
    const findings = productCompliance(
      [
        variant({}),
        variant({ id: "var_2", sku: "PAIN-2", isDiscontinued: true, priceCents: null }),
      ],
      ALL,
      RULES,
      [],
      "both",
    );

    expect(findings).toEqual([]);
  });
});
