import {
  StaffSuggestionRule,
  type StaffSuggestionRuleInput,
  type StaffSuggestionRuleSnapshot,
} from "../../entities/staff-suggestion-rule.js";
import { homeTriggering, STAFF_HOME_PLACES, triggeredAtHome } from "../home-suggestions.js";
import { traceCandidates } from "../suggestion-candidates.js";

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
    placement: "home",
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

describe("triggeredAtHome", () => {
  it("« partout » est vrai à l'accueil", () => {
    expect(triggeredAtHome(rule("A"))).toBe(true);
  });

  it("aucun autre déclencheur n'y est vrai, même sur une règle qui aurait échappé à l'emplacement", () => {
    const inCart = rule("C", {
      trigger: { kind: "product_in_cart", ref: "PAI-001" },
      placement: "cart",
    });
    const family = rule("F", {
      trigger: { kind: "category_in_cart", ref: "fam-pains" },
      placement: "cart",
    });
    const viewed = rule("V", {
      trigger: { kind: "product_viewed", ref: "PAI-001" },
      placement: "product",
    });

    expect([inCart, family, viewed].map(triggeredAtHome)).toEqual([false, false, false]);
  });
});

describe("homeTriggering", () => {
  it("n'exclut rien d'avance, et rend un doublon à la première règle", () => {
    const first = rule("FIRST", { suggestedSkus: ["PAI-001", "TER-001"] });
    const second = rule("SECOND", { suggestedSkus: ["TER-001", "BOI-001"] });

    const { candidates } = traceCandidates([first, second], homeTriggering());

    expect(candidates.map(({ sku, rule: by }) => [sku, by.id])).toEqual([
      ["PAI-001", "FIRST"],
      ["TER-001", "FIRST"],
      ["BOI-001", "SECOND"],
    ]);
  });

  it("l'accueil montre deux places", () => {
    expect(STAFF_HOME_PLACES).toBe(2);
  });
});
