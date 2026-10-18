import {
  StaffSuggestionRule,
  type StaffSuggestionRuleInput,
  type StaffSuggestionRuleSnapshot,
} from "../../entities/staff-suggestion-rule.js";
import { productCandidates, triggeredByProduct } from "../product-suggestions.js";

/** Aucune date n'est comparée à l'horloge ici : la période n'est pas jugée. */
function rule(
  id: string,
  over: Partial<StaffSuggestionRuleInput> = {},
): StaffSuggestionRuleSnapshot {
  const at = new Date(Date.UTC(2026, 9, 18, 8, 0));
  return StaffSuggestionRule.reconstitute({
    id,
    trigger: { kind: "everywhere", ref: null },
    suggestedSkus: ["TER-001"],
    placement: "product",
    audience: "both",
    startsOn: "2026-10-10",
    endsOn: "2026-10-30",
    phrase: null,
    priority: 0,
    ...over,
    active: true,
    created: { by: null, at },
    lastWrite: { by: null, at },
    archivedAt: null,
  }).snapshot();
}

const viewed = (sku: string) => rule("V", { trigger: { kind: "product_viewed", ref: sku } });

describe("triggeredByProduct", () => {
  it("« partout » est vrai sur toute fiche", () => {
    expect(triggeredByProduct(rule("A"), "PAI-001")).toBe(true);
  });

  it("une fiche ouverte : vraie sur la sienne, fausse ailleurs", () => {
    expect(triggeredByProduct(viewed("PAI-001"), "PAI-001")).toBe(true);
    expect(triggeredByProduct(viewed("PAI-001"), "VIE-001")).toBe(false);
  });

  it("un déclencheur de panier n'est jamais vrai en fiche, même sur l'article qu'il nomme", () => {
    const inCart = rule("C", {
      trigger: { kind: "product_in_cart", ref: "PAI-001" },
      placement: "cart",
    });
    const family = rule("F", {
      trigger: { kind: "category_in_cart", ref: "fam-pains" },
      placement: "cart",
    });

    expect(triggeredByProduct(inCart, "PAI-001")).toBe(false);
    expect(triggeredByProduct(family, "PAI-001")).toBe(false);
  });
});

describe("productCandidates", () => {
  it("n'offre jamais l'article de la fiche, et rend un doublon à la première règle", () => {
    const first = rule("FIRST", { suggestedSkus: ["PAI-001", "TER-001"] });
    const muted = rule("MUTED", {
      trigger: { kind: "product_viewed", ref: "VIE-001" },
      suggestedSkus: ["CHO-001"],
    });
    const second = rule("SECOND", { suggestedSkus: ["TER-001", "BOI-001"] });

    expect(
      productCandidates([first, muted, second], "PAI-001").map(({ sku, rule: by }) => [sku, by.id]),
    ).toEqual([
      ["TER-001", "FIRST"],
      ["BOI-001", "SECOND"],
    ]);
  });
});
