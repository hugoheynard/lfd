import {
  StaffSuggestionRule,
  type StaffSuggestionRuleInput,
  type StaffSuggestionRuleSnapshot,
} from "../../entities/staff-suggestion-rule.js";
import { cartCandidates, triggeredByCart, type CartContents } from "../cart-suggestions.js";

/** Aucune date n'est comparée à l'horloge ici : la période n'est pas jugée. */
function rule(
  id: string,
  over: Partial<StaffSuggestionRuleInput> = {},
): StaffSuggestionRuleSnapshot {
  const at = new Date(Date.UTC(2026, 9, 18, 8, 0));
  return StaffSuggestionRule.reconstitute({
    id,
    trigger: { kind: "everywhere", ref: null },
    suggestedSkus: ["BOI-001"],
    placement: "cart",
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

const CART: CartContents = {
  skus: ["VIE-001"],
  familyPaths: new Map([["VIE-001", ["fam-croissants", "fam-vien"]]]),
};

describe("triggeredByCart", () => {
  it("« partout » est vrai, même sur un panier vide", () => {
    expect(triggeredByCart(rule("A"), { skus: [], familyPaths: new Map() })).toBe(true);
  });

  it("un article au panier : vrai s'il y est, faux sinon", () => {
    const croissant = rule("A", { trigger: { kind: "product_in_cart", ref: "VIE-001" } });
    const baguette = rule("B", { trigger: { kind: "product_in_cart", ref: "PAI-001" } });

    expect(triggeredByCart(croissant, CART)).toBe(true);
    expect(triggeredByCart(baguette, CART)).toBe(false);
  });

  it("une famille : vraie pour elle-même et pour une parente, fausse pour une autre", () => {
    const own = rule("A", { trigger: { kind: "category_in_cart", ref: "fam-croissants" } });
    const parent = rule("B", { trigger: { kind: "category_in_cart", ref: "fam-vien" } });
    const other = rule("C", { trigger: { kind: "category_in_cart", ref: "fam-pains" } });

    expect(triggeredByCart(own, CART)).toBe(true);
    expect(triggeredByCart(parent, CART)).toBe(true);
    expect(triggeredByCart(other, CART)).toBe(false);
  });

  it("une famille ne mord pas un article dont la famille est inconnue", () => {
    const parent = rule("A", { trigger: { kind: "category_in_cart", ref: "fam-vien" } });

    expect(triggeredByCart(parent, { skus: ["VIE-001"], familyPaths: new Map() })).toBe(false);
  });
});

describe("cartCandidates", () => {
  it("suit l'ordre des règles puis des suggérés, et rend un doublon à la première règle", () => {
    const first = rule("FIRST", { suggestedSkus: ["BOI-001", "PAT-001"] });
    const muted = rule("MUTED", {
      trigger: { kind: "product_in_cart", ref: "PAI-001" },
      suggestedSkus: ["CHO-001"],
    });
    const second = rule("SECOND", { suggestedSkus: ["PAT-001", "SAL-001"] });

    const candidates = cartCandidates([first, muted, second], CART);

    expect(candidates.map(({ sku, rule: by }) => [sku, by.id])).toEqual([
      ["BOI-001", "FIRST"],
      ["PAT-001", "FIRST"],
      ["SAL-001", "SECOND"],
    ]);
  });

  it("aucune règle déclenchée : aucun candidat", () => {
    const off = rule("A", { trigger: { kind: "product_in_cart", ref: "PAI-001" } });

    expect(cartCandidates([off], CART)).toEqual([]);
  });
});
