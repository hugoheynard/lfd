import type { PromotionCatalogueArticle } from "../ports/promotion-catalogue.reader.js";
import type { PromotionRival } from "../promotion-overlap.js";
import { weightExtensionConflicts } from "../promotion-weight-conflicts.js";
import { basketTerms, lineTerms } from "./promotion-terms.fixture.js";

const article = (
  sku: string,
  overrides: Partial<PromotionCatalogueArticle> = {},
): PromotionCatalogueArticle => ({
  sku,
  name: `Article ${sku}`,
  productId: `prod_${sku}`,
  categoryPath: ["family_bread"],
  saleUnit: "piece",
  ...overrides,
});

const CATALOGUE = [article("PIECE"), article("KILO", { saleUnit: "weight" })];
const AMOUNT = { kind: "unit_amount_off", millicents: 50_000 } as const;

describe("weightExtensionConflicts — la liste dressée avant la bascule", () => {
  it("nomme deux pourcentages sans seuil qui se disputent désormais un article au poids", () => {
    const pieceOnly = (id: string): PromotionRival => ({
      id,
      terms: lineTerms({
        scope: {
          mode: "all_except",
          rules: [{ target: "variant", targetId: "PIECE", eligible: false, targetRank: null }],
        },
      }),
    });
    const conflicts = weightExtensionConflicts([pieceOnly("a"), pieceOnly("b")], CATALOGUE);
    expect(
      conflicts.map(({ leftId, rightId, overlap }) => [leftId, rightId, overlap.witness.sku]),
    ).toEqual([["a", "b", "KILO"]]);
  });

  it("ne nomme ni un montant, ni un seuil, ni deux remises de panier, ni deux cumulables", () => {
    const promotions: PromotionRival[] = [
      { id: "percent", terms: lineTerms() },
      { id: "amount", terms: lineTerms({ effect: AMOUNT }) },
      { id: "from3", terms: lineTerms({ conditions: [{ kind: "min_quantity", value: 3 }] }) },
    ];
    expect(weightExtensionConflicts(promotions, CATALOGUE)).toEqual([]);
    expect(
      weightExtensionConflicts(
        [
          { id: "x", terms: basketTerms() },
          { id: "y", terms: basketTerms() },
        ],
        CATALOGUE,
      ),
    ).toEqual([]);
    const cumulative = { id: "c", terms: lineTerms({ cumulative: true }) };
    expect(weightExtensionConflicts([cumulative, { ...cumulative, id: "d" }], CATALOGUE)).toEqual(
      [],
    );
  });
});
