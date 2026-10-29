import type { VariantSnapshot } from "../../entities/variant.js";
import { activationGaps, isActivatable } from "../activation-gaps.js";
import type { CompletenessRules } from "../variant-completeness.js";

/** La composition ne cite rien : seul le jugement de complétude parle. */
const NO_CITED_ALLERGENS: readonly string[] = [];

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
    proPriceMillicents: 812_345,
    proPricePerKgMillicents: null,
    publicPricePerKgTtcCents: null,
    pricePerKgShownPublic: true,
    pricePerKgShownPro: true,
    saleUnit: "piece",
    weightMinGrams: null,
    weightStepGrams: null,
    hasBeenPublished: false,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    minQuantities: { pro: null, public: null },
    minQuantityFollowsDefault: false,
    allergenSheet: { declared: [], mayContain: [] },
    nutrition: null,
    ...over,
  };
}

const ALL = { b2b: 20, takeaway: 5.5, eatIn: 10 };
const RULES: CompletenessRules = {
  activeContextKeys: ["b2b", "takeaway", "eatIn"],
};

describe("activationGaps — au moins une déclinaison complète (lot 2b)", () => {
  it("ne manque rien : une déclinaison complète", () => {
    const gaps = activationGaps([variant({})], ALL, RULES, NO_CITED_ALLERGENS, "both");

    expect(isActivatable(gaps)).toBe(true);
    expect(gaps).toEqual({ allDiscontinued: false, byVariant: {} });
  });

  /** 2b3 : l'autre déclinaison n'est pas vendue, elle n'empêche pas d'activer. */
  it("une seule déclinaison complète suffit, quoi qu'il manque aux autres", () => {
    const gaps = activationGaps(
      [variant({}), variant({ id: "var_2", sku: "PAT-2", priceCents: null, allergenSheet: null })],
      ALL,
      RULES,
      NO_CITED_ALLERGENS,
      "both",
    );

    expect(isActivatable(gaps)).toBe(true);
  });

  it("nomme chaque déclinaison vivante et ses manques quand aucune n'est complète", () => {
    const gaps = activationGaps(
      [
        variant({ priceCents: null, proPriceMillicents: null }),
        variant({ id: "var_2", sku: "PAT-2", priceCents: null, proPriceMillicents: null }),
        variant({ id: "var_3", sku: "PAT-3", isDiscontinued: true }),
      ],
      ALL,
      RULES,
      NO_CITED_ALLERGENS,
      "both",
    );

    expect(isActivatable(gaps)).toBe(false);
    expect(gaps.byVariant).toEqual({
      "PAT-1": ["price", "pro_price"],
      "PAT-2": ["price", "pro_price"],
    });
  });

  it("ne compte pas une déclinaison arrêtée, même complète", () => {
    const gaps = activationGaps(
      [variant({ isDiscontinued: true })],
      ALL,
      RULES,
      NO_CITED_ALLERGENS,
      "both",
    );

    expect(gaps).toEqual({ allDiscontinued: true, byVariant: {} });
    expect(isActivatable(gaps)).toBe(false);
  });

  /** La règle tranchée par Hugo : chaque contexte EN SERVICE, quelle que soit l'audience. */
  it("exige un taux pour chaque contexte en service", () => {
    const gaps = activationGaps(
      [variant({})],
      { b2b: 20, takeaway: 5.5 },
      RULES,
      NO_CITED_ALLERGENS,
      "both",
    );

    expect(gaps.byVariant).toEqual({ "PAT-1": ["vat:eatIn"] });
  });

  it("exige le taux b2b même si le contexte racine n'était pas listé en service", () => {
    const gaps = activationGaps(
      [variant({})],
      { takeaway: 5.5 },
      { ...RULES, activeContextKeys: ["takeaway"] },
      NO_CITED_ALLERGENS,
      "both",
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
      NO_CITED_ALLERGENS,
      "both",
    );

    expect(isActivatable(gaps)).toBe(true);
  });

  /** Le prix pro HT saisi est sa seule source (lot R3, 2026-10-27). */
  it("exige le prix pro saisi d'une fiche « pro », et le nomme", () => {
    const gaps = activationGaps(
      [variant({ proPriceMillicents: null })],
      ALL,
      RULES,
      NO_CITED_ALLERGENS,
      "pro",
    );

    expect(gaps.byVariant).toEqual({ "PAT-1": ["pro_price"] });
  });

  /** `plan-prix-manquant-non-bloquant.md` (2026-10-27) : un seul prix suffit à « les deux ». */
  it("n'empêche pas d'activer une fiche « les deux » à qui manque un seul prix", () => {
    const gaps = activationGaps(
      [variant({ proPriceMillicents: null })],
      ALL,
      RULES,
      NO_CITED_ALLERGENS,
      "both",
    );

    expect(isActivatable(gaps)).toBe(true);
  });
});
