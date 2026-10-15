import type { VariantSnapshot } from "../../entities/variant.js";
import { activationGaps, isActivatable } from "../activation-gaps.js";

function variant(over: Partial<VariantSnapshot>): VariantSnapshot {
  return {
    id: "var_1",
    sku: "PAT-1",
    name: { fr: "Tarte" },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: null,
    weightGrams: null,
    proPriceMillicents: null,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    allergenSheet: null,
    nutrition: null,
    ...over,
  };
}

const BOTH = { b2b: 20, takeaway: 5.5 };

describe("activationGaps — ce qui manque pour vendre", () => {
  it("ne manque rien : un prix, les deux taux", () => {
    const gaps = activationGaps([variant({ priceCents: 1_000 })], BOTH, "both", "ratio_ttc");

    expect(isActivatable(gaps)).toBe(true);
    expect(gaps).toEqual({
      proPriceRequired: false,
      priceMissing: false,
      unpricedVariantSkus: [],
      unbilledAudiences: [],
    });
  });

  it("une seule déclinaison tarifée suffit", () => {
    const gaps = activationGaps(
      [variant({ priceCents: 1_000 }), variant({ id: "var_2", sku: "PAT-2" })],
      BOTH,
      "both",
      "ratio_ttc",
    );

    expect(isActivatable(gaps)).toBe(true);
  });

  it("nomme toutes les déclinaisons vivantes quand aucune n'a de prix", () => {
    const gaps = activationGaps(
      [
        variant({}),
        variant({ id: "var_2", sku: "PAT-2" }),
        variant({ id: "var_3", sku: "PAT-3", isDiscontinued: true }),
      ],
      BOTH,
      "both",
      "ratio_ttc",
    );

    expect(gaps.priceMissing).toBe(true);
    expect(gaps.unpricedVariantSkus).toEqual(["PAT-1", "PAT-2"]);
  });

  /** Un prix sur une déclinaison ARRÊTÉE ne vend rien. */
  it("ne compte pas le prix d'une déclinaison arrêtée", () => {
    const gaps = activationGaps(
      [variant({ priceCents: 1_000, isDiscontinued: true })],
      BOTH,
      "both",
      "ratio_ttc",
    );

    expect(gaps.priceMissing).toBe(true);
    expect(gaps.unpricedVariantSkus).toEqual([]);
    expect(isActivatable(gaps)).toBe(false);
  });

  it("vendre aux pros demande le taux « b2b »", () => {
    const gaps = activationGaps(
      [variant({ priceCents: 1_000 })],
      { takeaway: 5.5 },
      "pro",
      "ratio_ttc",
    );

    expect(gaps.unbilledAudiences).toEqual([{ audience: "pro", contextKey: "b2b" }]);
  });

  it("vendre au public demande le taux « takeaway »", () => {
    const gaps = activationGaps(
      [variant({ priceCents: 1_000 })],
      { b2b: 20 },
      "public",
      "ratio_ttc",
    );

    expect(gaps.unbilledAudiences).toEqual([{ audience: "public", contextKey: "takeaway" }]);
  });

  it("vendre aux deux demande les deux, et nomme chacun", () => {
    const gaps = activationGaps([variant({ priceCents: 1_000 })], {}, "both", "ratio_ttc");

    expect(gaps.unbilledAudiences).toEqual([
      { audience: "pro", contextKey: "b2b" },
      { audience: "public", contextKey: "takeaway" },
    ]);
  });

  /** Un taux à 0 % est un taux : seule l'ABSENCE de clé manque. */
  it("un taux à 0 % est un taux réglé", () => {
    const gaps = activationGaps([variant({ priceCents: 0 })], { b2b: 0 }, "pro", "ratio_ttc");

    expect(isActivatable(gaps)).toBe(true);
  });

  /** Lot P (P4) : sous « Prix saisi », un prix public seul ne vend rien aux pros. */
  describe("sous la méthode entered", () => {
    it("exige le prix pro HT saisi en plus du prix public", () => {
      const gaps = activationGaps([variant({ priceCents: 1_000 })], BOTH, "both", "entered");

      expect(gaps.proPriceRequired).toBe(true);
      expect(gaps.priceMissing).toBe(true);
      expect(gaps.unpricedVariantSkus).toEqual(["PAT-1"]);
      expect(isActivatable(gaps)).toBe(false);
    });

    it("accepte une déclinaison qui porte les deux prix", () => {
      const gaps = activationGaps(
        [
          variant({ priceCents: 1_000 }),
          variant({ id: "var_2", sku: "PAT-2", priceCents: 900, proPriceMillicents: 812_345 }),
        ],
        BOTH,
        "both",
        "entered",
      );

      expect(isActivatable(gaps)).toBe(true);
    });

    it("ne demande rien de plus sous ratio_ttc, même sans saisie", () => {
      const gaps = activationGaps([variant({ priceCents: 1_000 })], BOTH, "both", "ratio_ttc");

      expect(gaps.proPriceRequired).toBe(false);
      expect(isActivatable(gaps)).toBe(true);
    });
  });
});
