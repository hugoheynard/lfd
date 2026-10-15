import {
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
  proPriceMillicents: null,
  allergenSheet: { declared: ["gluten"], mayContain: [] },
};
const RULES: CompletenessRules = {
  activeContextKeys: ["b2b", "takeaway", "eatIn"],
  policy: { method: "ratio_ttc", ratioBp: 9_000 },
};
const ALL = { b2b: 5.5, takeaway: 5.5, eatIn: 10 };

describe("variantGaps", () => {
  it("ne manque rien à une déclinaison complète", () => {
    expect(variantGaps(COMPLETE, ALL, RULES)).toEqual([]);
  });

  it("nomme tout ce qui manque, dans l'ordre de l'écran", () => {
    expect(variantGaps({ ...COMPLETE, priceCents: null, allergenSheet: null }, {}, RULES)).toEqual([
      "price",
      "allergens",
      "vat:b2b",
      "vat:takeaway",
      "vat:eatIn",
    ]);
  });

  /** `[]` est une déclaration — « aucun allergène » est une réponse. */
  it("compte « aucun allergène » comme déclaré", () => {
    const none = { ...COMPLETE, allergenSheet: { declared: [], mayContain: [] } };

    expect(variantGaps(none, ALL, RULES)).toEqual([]);
  });

  it("ignore l'audience : un contexte en service manque même s'il ne sert personne aujourd'hui", () => {
    expect(variantGaps(COMPLETE, { b2b: 5.5, takeaway: 5.5 }, RULES)).toEqual(["vat:eatIn"]);
  });

  it("ne demande rien pour un contexte hors service", () => {
    expect(variantGaps(COMPLETE, { b2b: 5.5 }, { ...RULES, activeContextKeys: ["b2b"] })).toEqual(
      [],
    );
  });

  it("nomme le rapport pro non réglé", () => {
    expect(variantGaps(COMPLETE, ALL, { ...RULES, policy: null })).toEqual(["pro_price_rule"]);
  });

  /** La saisie prime, quelle que soit la méthode (lot P). */
  it("sous entered, sans saisie : prix pro manquant ; avec saisie : complète", () => {
    const entered: CompletenessRules = { ...RULES, policy: { method: "entered", ratioBp: 9_000 } };

    expect(variantGaps(COMPLETE, ALL, entered)).toEqual(["pro_price"]);
    expect(variantGaps({ ...COMPLETE, proPriceMillicents: 1_000_000 }, ALL, entered)).toEqual([]);
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
