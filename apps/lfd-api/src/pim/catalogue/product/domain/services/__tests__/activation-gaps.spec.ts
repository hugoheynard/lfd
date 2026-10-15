import type { VariantSnapshot } from "../../entities/variant.js";
import { activationGaps, isActivatable } from "../activation-gaps.js";
import type { CompletenessRules } from "../variant-completeness.js";

function variant(over: Partial<VariantSnapshot>): VariantSnapshot {
  return {
    id: "var_1",
    sku: "PAT-1",
    name: { fr: "Tarte" },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: 1_000,
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

const ALL = { b2b: 20, takeaway: 5.5, eatIn: 10 };
const RULES: CompletenessRules = {
  activeContextKeys: ["b2b", "takeaway", "eatIn"],
  policy: { method: "ratio_ttc", ratioBp: 9_000 },
};

describe("activationGaps — au moins une déclinaison complète (lot 2b)", () => {
  it("ne manque rien : une déclinaison complète", () => {
    const gaps = activationGaps([variant({})], ALL, RULES);

    expect(isActivatable(gaps)).toBe(true);
    expect(gaps).toEqual({ allDiscontinued: false, byVariant: {} });
  });

  /** 2b3 : l'autre déclinaison n'est pas vendue, elle n'empêche pas d'activer. */
  it("une seule déclinaison complète suffit, quoi qu'il manque aux autres", () => {
    const gaps = activationGaps(
      [variant({}), variant({ id: "var_2", sku: "PAT-2", priceCents: null, allergenSheet: null })],
      ALL,
      RULES,
    );

    expect(isActivatable(gaps)).toBe(true);
  });

  it("nomme chaque déclinaison vivante et ses manques quand aucune n'est complète", () => {
    const gaps = activationGaps(
      [
        variant({ priceCents: null }),
        variant({ id: "var_2", sku: "PAT-2", allergenSheet: null }),
        variant({ id: "var_3", sku: "PAT-3", isDiscontinued: true }),
      ],
      ALL,
      RULES,
    );

    expect(isActivatable(gaps)).toBe(false);
    expect(gaps.byVariant).toEqual({ "PAT-1": ["price"], "PAT-2": ["allergens"] });
  });

  it("ne compte pas une déclinaison arrêtée, même complète", () => {
    const gaps = activationGaps([variant({ isDiscontinued: true })], ALL, RULES);

    expect(gaps).toEqual({ allDiscontinued: true, byVariant: {} });
    expect(isActivatable(gaps)).toBe(false);
  });

  /** La règle tranchée par Hugo : chaque contexte EN SERVICE, quelle que soit l'audience. */
  it("exige un taux pour chaque contexte en service", () => {
    const gaps = activationGaps([variant({})], { b2b: 20, takeaway: 5.5 }, RULES);

    expect(gaps.byVariant).toEqual({ "PAT-1": ["vat:eatIn"] });
  });

  it("exige le taux b2b même si le contexte racine n'était pas listé en service", () => {
    const gaps = activationGaps(
      [variant({})],
      { takeaway: 5.5 },
      { ...RULES, activeContextKeys: ["takeaway"] },
    );

    expect(gaps.byVariant).toEqual({ "PAT-1": ["vat:b2b"] });
  });

  /** Un taux à 0 % est un taux : seule l'ABSENCE de clé manque. */
  it("un taux à 0 % est un taux réglé", () => {
    const gaps = activationGaps(
      [variant({ priceCents: 0 })],
      { b2b: 0 },
      {
        ...RULES,
        activeContextKeys: ["b2b"],
      },
    );

    expect(isActivatable(gaps)).toBe(true);
  });

  it("refuse tant que le rapport pro n'est pas réglé", () => {
    const gaps = activationGaps([variant({})], ALL, { ...RULES, policy: null });

    expect(gaps.byVariant).toEqual({ "PAT-1": ["pro_price_rule"] });
  });

  /** Lot P : la saisie prime ; sous `entered`, sans saisie, aucun repli. */
  describe("le prix pro, résolu par la porte", () => {
    const entered: CompletenessRules = { ...RULES, policy: { method: "entered", ratioBp: 9_000 } };

    it("sous entered, exige la saisie", () => {
      expect(activationGaps([variant({})], ALL, entered).byVariant).toEqual({
        "PAT-1": ["pro_price"],
      });
    });

    it("sous entered, accepte une déclinaison qui porte les deux prix", () => {
      const gaps = activationGaps([variant({ proPriceMillicents: 812_345 })], ALL, entered);

      expect(isActivatable(gaps)).toBe(true);
    });

    it("sous ratio_ttc, le repli suffit sans saisie", () => {
      expect(isActivatable(activationGaps([variant({})], ALL, RULES))).toBe(true);
    });
  });
});
