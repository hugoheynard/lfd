import {
  StaffSuggestionRule,
  type StaffSuggestionRuleInput,
  type StaffSuggestionRuleSnapshot,
} from "../../entities/staff-suggestion-rule.js";
import { applicableSuggestions, type ApplicableSuggestionsAsk } from "../applicable-suggestions.js";
import { NO_SUGGESTION_CONDITIONS } from "../../value-objects/suggestion-conditions.js";

/** Les jours ne sont comparés qu'à `TODAY`, passé à la fonction. */
const TODAY = "2026-10-18";

function rule(
  id: string,
  createdAtMinute: number,
  over: Partial<StaffSuggestionRuleInput> & {
    readonly active?: boolean;
    readonly archived?: boolean;
  } = {},
): StaffSuggestionRuleSnapshot {
  const { active = true, archived = false, ...fields } = over;
  const at = new Date(Date.UTC(2026, 9, 18, 8, createdAtMinute));
  const built = StaffSuggestionRule.reconstitute({
    id,
    trigger: { kind: "everywhere", ref: null },
    suggestedSkus: ["BOI-001"],
    placement: "home",
    audience: "both",
    startsOn: "2026-10-10",
    endsOn: "2026-10-30",
    phrase: null,
    priority: 0,
    conditions: NO_SUGGESTION_CONDITIONS,
    ...fields,
    active,
    created: { by: null, at },
    lastWrite: { by: null, at },
    archivedAt: archived ? at : null,
  });
  return built.snapshot();
}

const ASK: ApplicableSuggestionsAsk = {
  placement: "home",
  today: TODAY,
  reader: "pro",
  order: "recent",
  context: null,
};

const ids = (rules: readonly StaffSuggestionRuleSnapshot[]) => rules.map((one) => one.id);

describe("applicableSuggestions", () => {
  it("écarte l'archivée, la coupée, l'autre emplacement, l'autre audience, et hors période", () => {
    const rules = [
      rule("ok", 1),
      rule("archived", 2, { archived: true }),
      rule("off", 3, { active: false }),
      rule("cart", 4, { placement: "cart" }),
      rule("public", 5, { audience: "public" }),
      rule("pro", 6, { audience: "pro" }),
      rule("future", 7, { startsOn: "2026-10-19", endsOn: "2026-10-30" }),
      rule("past", 8, { startsOn: "2026-10-01", endsOn: "2026-10-17" }),
      rule("lastDay", 9, { startsOn: "2026-10-01", endsOn: TODAY }),
    ];
    expect(ids(applicableSuggestions(rules, ASK))).toEqual(["lastDay", "pro", "ok"]);
  });

  it("ne sert à un lecteur inconnu que les règles des deux audiences", () => {
    const rules = [rule("both", 1), rule("pro", 2, { audience: "pro" })];
    expect(ids(applicableSuggestions(rules, { ...ASK, reader: null }))).toEqual(["both"]);
  });

  it("en `recent`, la plus récemment créée d'abord, quelle que soit la priorité", () => {
    const rules = [rule("old-high", 1, { priority: 9 }), rule("new-low", 2, { priority: 0 })];
    expect(ids(applicableSuggestions(rules, ASK))).toEqual(["new-low", "old-high"]);
  });

  it("en `priority`, la plus haute d'abord, puis la plus récente à égalité", () => {
    const rules = [
      rule("old-high", 1, { priority: 9 }),
      rule("new-low", 2, { priority: 0 }),
      rule("newer-high", 3, { priority: 9 }),
    ];
    expect(ids(applicableSuggestions(rules, { ...ASK, order: "priority" }))).toEqual([
      "newer-high",
      "old-high",
      "new-low",
    ]);
  });
});
