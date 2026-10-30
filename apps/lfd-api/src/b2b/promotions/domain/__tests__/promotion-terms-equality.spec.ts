import { PromotionAudienceSet } from "../promotion-audience-set.js";
import { sameTerms } from "../promotion-terms-equality.js";
import { UNTIL, lineTerms } from "./promotion-terms.fixture.js";

describe("sameTerms — deux termes disent-ils la même chose ?", () => {
  it("deux termes construits séparément, de même contenu, sont identiques", () => {
    expect(sameTerms(lineTerms(), lineTerms())).toBe(true);
  });

  it("une même date en deux instances est la même date", () => {
    const a = lineTerms({ validTo: new Date(UNTIL.getTime()) });
    const b = lineTerms({ validTo: new Date(UNTIL.getTime()) });
    expect(sameTerms(a, b)).toBe(true);
  });

  it.each([
    ["le nom interne", lineTerms({ internalName: "Autre" })],
    ["le libellé", lineTerms({ label: { fr: "−20 % sur tout", en: "20% off", it: null } })],
    [
      "les libellés d'audience",
      lineTerms({ audienceLabels: { individuals: { fr: "x", en: null, it: null }, pros: null } }),
    ],
    ["le cumul", lineTerms({ cumulative: true })],
    ["l'effet", lineTerms({ effect: { kind: "percent_off", basisPoints: 1500 } })],
    ["la fin de fenêtre", lineTerms({ validTo: UNTIL })],
    ["le public", lineTerms({ audiences: PromotionAudienceSet.of([{ kind: "individuals" }]) })],
    ["l'acheminement", lineTerms({ fulfillment: { kind: "delivery" } })],
    [
      "la portée",
      lineTerms({
        scope: {
          mode: "all_except",
          rules: [{ target: "category", targetId: "cat_1", eligible: false, targetRank: null }],
        },
      }),
    ],
    ["les conditions", lineTerms({ conditions: [{ kind: "min_quantity", value: 3 }] })],
  ])("diffèrent dès que %s change", (_what, other) => {
    expect(sameTerms(lineTerms(), other)).toBe(false);
  });
});
