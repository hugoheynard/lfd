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
  proPriceMillicents: 1_023_697,
};
const RULES: CompletenessRules = {
  activeContextKeys: ["b2b", "takeaway", "eatIn"],
};
const ALL = { b2b: 5.5, takeaway: 5.5, eatIn: 10 };

describe("variantGaps", () => {
  it("ne manque rien à une déclinaison complète", () => {
    expect(variantGaps(COMPLETE, ALL, RULES)).toEqual([]);
  });

  it("nomme tout ce qui manque, dans l'ordre de l'écran", () => {
    expect(variantGaps({ ...COMPLETE, priceCents: null }, {}, RULES)).toEqual([
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
    expect(variantGaps(COMPLETE, ALL, RULES)).not.toContain("allergens");
  });

  it("ignore l'audience : un contexte en service manque même s'il ne sert personne aujourd'hui", () => {
    expect(variantGaps(COMPLETE, { b2b: 5.5, takeaway: 5.5 }, RULES)).toEqual(["vat:eatIn"]);
  });

  it("ne demande rien pour un contexte hors service", () => {
    expect(variantGaps(COMPLETE, { b2b: 5.5 }, { ...RULES, activeContextKeys: ["b2b"] })).toEqual(
      [],
    );
  });

  /** Le prix pro HT saisi est sa seule source (lot R3, 2026-10-27). */
  it("nomme le prix pro manquant sans saisie", () => {
    expect(variantGaps({ ...COMPLETE, proPriceMillicents: null }, ALL, RULES)).toEqual([
      "pro_price",
    ]);
  });

  /**
   * Régression (lot R3) : `pro_price_rule` — « rapport pro non réglé » — ne
   * sort plus jamais, même sans prix pro ni taux : il n'y a plus de rapport.
   */
  it("ne nomme jamais le rapport pro", () => {
    const empty = { priceCents: null, proPriceMillicents: null, allergenSheet: null };

    expect(variantGaps(empty, {}, RULES)).not.toContain("pro_price_rule");
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
