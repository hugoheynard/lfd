import {
  promotionScopeCovers,
  promotionScopeMatch,
  type PromotionScope,
  type PromotionScopeFacts,
  type PromotionScopeRule,
} from "../promotion-scope.js";

const LINE_PIECE = { kind: "line", saleUnit: "piece" } as const;
const LINE_WEIGHT = { kind: "line", saleUnit: "weight" } as const;
const BASKET = { kind: "basket" } as const;

const CROISSANT: PromotionScopeFacts = {
  sku: "SKU-CROISSANT",
  productId: "p_croissant",
  categoryPath: ["c_viennoiserie", "c_boulangerie"],
};
const FROMAGE_AU_POIDS: PromotionScopeFacts = {
  sku: "SKU-COMTE",
  productId: "p_comte",
  categoryPath: ["c_cremerie"],
};

function rule(
  target: PromotionScopeRule["target"],
  targetId: string,
  eligible: boolean,
  targetRank: number | null = null,
): PromotionScopeRule {
  return { target, targetId, eligible, targetRank };
}

function scope(mode: PromotionScope["mode"], rules: readonly PromotionScopeRule[] = []) {
  return { mode, rules };
}

describe("promotionScopeMatch — la portée d'éligibilité", () => {
  it("« tout sauf » sans règle couvre tout article à la pièce, au rang du mode", () => {
    expect(promotionScopeMatch(scope("all_except"), CROISSANT, LINE_PIECE)).toEqual({
      rank: 0,
      familyCloseness: 0,
    });
  });

  it("« seulement » sans inclusion qui le vise ne couvre rien", () => {
    expect(promotionScopeCovers(scope("only"), CROISSANT, LINE_PIECE)).toBe(false);
    expect(promotionScopeCovers(scope("only"), CROISSANT, BASKET)).toBe(false);
  });

  it("la famille la plus proche décide, et sa proximité est rendue", () => {
    const both = scope("only", [rule("category", "c_boulangerie", true)]);
    expect(promotionScopeMatch(both, CROISSANT, LINE_PIECE)).toEqual({
      rank: 1,
      familyCloseness: 1,
    });
    const nearest = scope("all_except", [
      rule("category", "c_boulangerie", false),
      rule("category", "c_viennoiserie", true),
    ]);
    expect(promotionScopeMatch(nearest, CROISSANT, LINE_PIECE)).toEqual({
      rank: 1,
      familyCloseness: 2,
    });
  });

  it("une famille exclue retire l'article en « tout sauf »", () => {
    const excluded = scope("all_except", [rule("category", "c_viennoiserie", false)]);
    expect(promotionScopeCovers(excluded, CROISSANT, LINE_PIECE)).toBe(false);
  });

  it("le produit l'emporte sur la famille, dans les deux sens", () => {
    const reincluded = scope("all_except", [
      rule("category", "c_viennoiserie", false),
      rule("product", "p_croissant", true),
    ]);
    expect(promotionScopeMatch(reincluded, CROISSANT, LINE_PIECE)).toEqual({
      rank: 2,
      familyCloseness: 0,
    });
    const excluded = scope("only", [
      rule("category", "c_viennoiserie", true),
      rule("product", "p_croissant", false),
    ]);
    expect(promotionScopeCovers(excluded, CROISSANT, LINE_PIECE)).toBe(false);
  });

  it("la déclinaison l'emporte sur le produit", () => {
    const variantOut = scope("only", [
      rule("product", "p_croissant", true),
      rule("variant", "SKU-CROISSANT", false),
    ]);
    expect(promotionScopeCovers(variantOut, CROISSANT, LINE_PIECE)).toBe(false);
    const variantIn = scope("only", [rule("variant", "SKU-CROISSANT", true)]);
    expect(promotionScopeMatch(variantIn, CROISSANT, LINE_PIECE)?.rank).toBe(3);
  });

  it("une déclinaison reprise d'une portée produit garde le rang 2", () => {
    const reprise = scope("only", [rule("variant", "SKU-CROISSANT", true, 2)]);
    expect(promotionScopeMatch(reprise, CROISSANT, LINE_PIECE)?.rank).toBe(2);
  });

  it("un produit inconnu du catalogue n'est jugé que par sa famille et le mode", () => {
    const unknown = { sku: "SKU-X", productId: null, categoryPath: [] };
    const productRule = scope("all_except", [rule("product", "p_croissant", false)]);
    expect(promotionScopeCovers(productRule, unknown, BASKET)).toBe(true);
    expect(promotionScopeCovers(scope("only"), unknown, BASKET)).toBe(false);
  });

  describe("l'article au poids", () => {
    it("au point ligne, ni le mode ni une famille ne le visent", () => {
      expect(promotionScopeCovers(scope("all_except"), FROMAGE_AU_POIDS, LINE_WEIGHT)).toBe(false);
      const family = scope("only", [rule("category", "c_cremerie", true)]);
      expect(promotionScopeCovers(family, FROMAGE_AU_POIDS, LINE_WEIGHT)).toBe(false);
    });

    it("au point ligne, une décision sur l'article lui-même le vise", () => {
      const product = scope("only", [rule("product", "p_comte", true)]);
      const variant = scope("only", [rule("variant", "SKU-COMTE", true)]);
      expect(promotionScopeCovers(product, FROMAGE_AU_POIDS, LINE_WEIGHT)).toBe(true);
      expect(promotionScopeCovers(variant, FROMAGE_AU_POIDS, LINE_WEIGHT)).toBe(true);
    });

    it("au point panier, le mode et la famille le couvrent comme un autre", () => {
      expect(promotionScopeCovers(scope("all_except"), FROMAGE_AU_POIDS, BASKET)).toBe(true);
      const family = scope("only", [rule("category", "c_cremerie", true)]);
      expect(promotionScopeCovers(family, FROMAGE_AU_POIDS, BASKET)).toBe(true);
    });
  });
});
