import {
  missingAudiencePrices,
  requiredContexts,
  variantGaps,
  type CompletenessInput,
  type CompletenessRules,
} from "../variant-completeness.js";

/**
 * **La règle de complétude d'une déclinaison** (lot 2b de
 * `plan-catalogue-synchronise-par-audience.md`) — l'unique définition, que
 * l'activation et les faits du catalogue appellent tous deux.
 */

const COMPLETE: CompletenessInput = {
  priceCents: 1_200,
  proPriceMillicents: 1_023_697,
  saleUnit: "piece",
  weightStepGrams: null,
};
const RULES: CompletenessRules = {
  activeContextKeys: ["b2b", "takeaway", "eatIn"],
};
const ALL = { b2b: 5.5, takeaway: 5.5, eatIn: 10 };

describe("variantGaps", () => {
  it("ne manque rien à une déclinaison complète", () => {
    expect(variantGaps(COMPLETE, ALL, RULES, "both")).toEqual([]);
  });

  it("nomme tout ce qui manque, dans l'ordre de l'écran", () => {
    expect(variantGaps({ ...COMPLETE, priceCents: null }, {}, RULES, "public")).toEqual([
      "price",
      "vat:b2b",
      "vat:takeaway",
      "vat:eatIn",
    ]);
  });

  /**
   * La déclaration d'allergènes n'est plus un manque (2026-10-27,
   * `plan-allergenes-jamais-bloquants.md`) : la règle ne la lit plus du tout,
   * l'absence se sert par précaution (`effective-allergens.ts`).
   */
  it("ne compte plus les allergènes parmi les manques", () => {
    expect(variantGaps(COMPLETE, ALL, RULES, "both")).not.toContain("allergens");
  });

  it("ignore l'audience : un contexte en service manque même s'il ne sert personne aujourd'hui", () => {
    expect(variantGaps(COMPLETE, { b2b: 5.5, takeaway: 5.5 }, RULES, "both")).toEqual([
      "vat:eatIn",
    ]);
  });

  it("ne demande rien pour un contexte hors service", () => {
    expect(
      variantGaps(COMPLETE, { b2b: 5.5 }, { ...RULES, activeContextKeys: ["b2b"] }, "both"),
    ).toEqual([]);
  });

  /** Le prix pro HT saisi est sa seule source (lot R3, 2026-10-27). */
  it("nomme le prix pro manquant sans saisie, sur une fiche « pro »", () => {
    expect(variantGaps({ ...COMPLETE, proPriceMillicents: null }, ALL, RULES, "pro")).toEqual([
      "pro_price",
    ]);
  });

  /**
   * Régression (lot R3) : `pro_price_rule` — « rapport pro non réglé » — ne
   * sort plus jamais, même sans prix pro ni taux : il n'y a plus de rapport.
   */
  it("ne nomme jamais le rapport pro", () => {
    const empty = { ...COMPLETE, priceCents: null, proPriceMillicents: null };

    expect(variantGaps(empty, {}, RULES, "both")).not.toContain("pro_price_rule");
  });
});

/** La vente au poids (`vente-au-poids.md`, lot P1) : le pas est exigé. */
describe("variantGaps — la vente au poids", () => {
  it("nomme le pas manquant d'une déclinaison au poids", () => {
    expect(variantGaps({ ...COMPLETE, saleUnit: "weight" }, ALL, RULES, "both")).toEqual([
      "weight_step",
    ]);
  });

  it("ne demande rien de plus quand le pas est saisi", () => {
    expect(
      variantGaps({ ...COMPLETE, saleUnit: "weight", weightStepGrams: 100 }, ALL, RULES, "both"),
    ).toEqual([]);
  });

  it("ne demande jamais de pas à la pièce", () => {
    expect(variantGaps(COMPLETE, ALL, RULES, "both")).not.toContain("weight_step");
  });
});

/**
 * Les six lignes du §2 de `plan-prix-manquant-non-bloquant.md` (2026-10-27) :
 * vendable dès qu'elle a le prix d'AU MOINS UNE audience visée.
 */
describe("variantGaps — le prix d'au moins une audience visée", () => {
  const NO_PUBLIC = { ...COMPLETE, priceCents: null };
  const NO_PRO = { ...COMPLETE, proPriceMillicents: null };
  const NONE = { ...COMPLETE, priceCents: null, proPriceMillicents: null };

  it.each([
    ["both", COMPLETE, []],
    ["both", NO_PRO, []],
    ["both", NO_PUBLIC, []],
    ["public", NO_PUBLIC, ["price"]],
    ["pro", NO_PRO, ["pro_price"]],
    ["both", NONE, ["price", "pro_price"]],
  ] as const)("fiche %s : %o → %o", (audience, variant, expected) => {
    expect(variantGaps(variant, ALL, RULES, audience)).toEqual(expected);
  });

  it("n'exige jamais le prix d'une audience que la fiche ne vise pas", () => {
    expect(variantGaps(NO_PRO, ALL, RULES, "public")).toEqual([]);
    expect(variantGaps(NO_PUBLIC, ALL, RULES, "pro")).toEqual([]);
  });
});

describe("missingAudiencePrices", () => {
  it("rend les audiences visées sans prix, et elles seules", () => {
    expect(missingAudiencePrices({ ...COMPLETE, proPriceMillicents: null }, "both")).toEqual([
      "pro",
    ]);
    expect(missingAudiencePrices({ ...COMPLETE, priceCents: null }, "both")).toEqual(["public"]);
    expect(missingAudiencePrices({ ...COMPLETE, priceCents: null }, "pro")).toEqual([]);
    expect(missingAudiencePrices(COMPLETE, "both")).toEqual([]);
  });
});

describe("requiredContexts", () => {
  it("rend les contextes en service, b2b compris, sans doublon", () => {
    expect(requiredContexts(RULES)).toEqual(["b2b", "takeaway", "eatIn"]);
  });

  /** Le prix pro HT servi ne se calcule pas sans le taux b2b. */
  it("garde b2b même hors de la liste", () => {
    expect(requiredContexts({ ...RULES, activeContextKeys: ["takeaway"] })).toEqual([
      "b2b",
      "takeaway",
    ]);
  });
});
