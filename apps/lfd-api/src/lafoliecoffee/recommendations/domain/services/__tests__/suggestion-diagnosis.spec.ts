import {
  StaffSuggestionRule,
  type StaffSuggestionRuleInput,
  type StaffSuggestionRuleSnapshot,
} from "../../entities/staff-suggestion-rule.js";
import { ruleGate } from "../applicable-suggestions.js";
import { cartTriggering } from "../cart-suggestions.js";
import { productTriggering } from "../product-suggestions.js";
import { traceCandidates } from "../suggestion-candidates.js";
import { diagnoseRules } from "../suggestion-diagnosis.js";
import { NO_SUGGESTION_CONDITIONS } from "../../value-objects/suggestion-conditions.js";

/** Les jours ne sont comparés qu'entre eux (la période contre `today`), jamais à l'horloge. */
const TODAY = "2026-10-18";

function rule(
  id: string,
  over: Partial<StaffSuggestionRuleInput> = {},
  active = true,
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
    conditions: NO_SUGGESTION_CONDITIONS,
    ...over,
    active,
    created: { by: null, at },
    lastWrite: { by: null, at },
    archivedAt: null,
  }).snapshot();
}

describe("ruleGate", () => {
  const ask = { placement: "cart", today: TODAY, reader: "public", context: null } as const;

  it("nomme la première porte fermée : période, interrupteur, audience, emplacement", () => {
    expect(ruleGate(rule("A", { endsOn: "2026-10-17" }), ask)).toBe("ended");
    expect(ruleGate(rule("A", { startsOn: "2026-10-19" }), ask)).toBe("not_started");
    expect(ruleGate(rule("A", {}, false), ask)).toBe("inactive");
    expect(ruleGate(rule("A", { audience: "pro" }), ask)).toBe("wrong_audience");
    expect(ruleGate(rule("A", { placement: "home" }), ask)).toBe("wrong_placement");
    expect(ruleGate(rule("A"), ask)).toBeNull();
  });

  it("une période finie l'emporte sur l'interrupteur coupé", () => {
    expect(ruleGate(rule("A", { endsOn: "2026-10-17" }, false), ask)).toBe("ended");
  });
});

describe("traceCandidates", () => {
  it("écarte l'article de la fiche et rend un doublon battu par la première règle", () => {
    const first = rule("FIRST", {
      placement: "product",
      suggestedSkus: ["PAI-001", "TER-001"],
    });
    const second = rule("SECOND", { placement: "product", suggestedSkus: ["TER-001"] });
    const muted = rule("MUTED", {
      placement: "product",
      trigger: { kind: "product_viewed", ref: "VIE-001" },
      suggestedSkus: ["BOI-001"],
    });

    const { candidates, rules } = traceCandidates(
      [first, second, muted],
      productTriggering("PAI-001"),
    );

    expect(candidates.map(({ sku, rule: by }) => [sku, by.id])).toEqual([["TER-001", "FIRST"]]);
    expect(rules.map(({ triggered, items }) => [triggered, items])).toEqual([
      [
        true,
        [
          { sku: "PAI-001", refusal: { kind: "item_is_the_product" } },
          { sku: "TER-001", refusal: null },
        ],
      ],
      [true, [{ sku: "TER-001", refusal: { kind: "outranked_by", ruleId: "FIRST" } }]],
      [false, []],
    ]);
  });
});

describe("diagnoseRules", () => {
  it("rend chaque règle avec sa raison, les applicables d'abord, et la place perdue", () => {
    const shown = rule("SHOWN", { suggestedSkus: ["BOI-001", "BOI-002", "BOI-003"] });
    const muted = rule("MUTED", { trigger: { kind: "product_in_cart", ref: "VIE-001" } });
    const ended = rule("ENDED", { endsOn: "2026-10-17" });
    const ask = { placement: "cart", today: TODAY, reader: "public", context: null } as const;
    const { rules: traced } = traceCandidates([shown, muted], {
      triggered: (candidate) => candidate.id !== "MUTED",
      excluded: [],
    });

    const diagnosed = diagnoseRules({
      live: [ended, muted, shown],
      gateOf: (candidate) => ruleGate(candidate, ask),
      traced,
      refused: new Map([["BOI-002", "item_not_orderable_that_day"]]),
      shown: [{ sku: "BOI-001", ruleId: "SHOWN" }],
    });

    expect(diagnosed.map(({ rule: by, verdict, items }) => [by.id, verdict, items])).toEqual([
      [
        "SHOWN",
        { kind: "shown" },
        [
          { sku: "BOI-001", verdict: { kind: "shown" } },
          { sku: "BOI-002", verdict: { kind: "item_not_orderable_that_day" } },
          { sku: "BOI-003", verdict: { kind: "outranked_by", ruleId: "SHOWN" } },
        ],
      ],
      ["MUTED", { kind: "trigger_false" }, []],
      ["ENDED", { kind: "ended" }, []],
    ]);
  });

  it("une règle déclenchée dont aucun article ne passe prend la raison du premier", () => {
    const only = rule("ONLY", { suggestedSkus: ["BOI-001", "BOI-002"] });
    const { rules: traced } = traceCandidates([only], { triggered: () => true, excluded: [] });

    const [diagnosed] = diagnoseRules({
      live: [only],
      gateOf: () => null,
      traced,
      refused: new Map([
        ["BOI-001", "item_in_cart"],
        ["BOI-002", "item_not_served"],
      ]),
      shown: [],
    });

    expect(diagnosed?.verdict).toEqual({ kind: "item_in_cart" });
  });
});

describe("diagnoseRules — les conditions (RS8)", () => {
  it("une condition de contexte se lit comme une porte ; la famille exclue après le déclencheur", () => {
    const context = {
      day: TODAY,
      time: "06:00",
      site: { kind: "unknown" } as const,
      cartTotalCents: null,
    };
    const ask = { placement: "cart", today: TODAY, reader: "public", context } as const;
    const morning = rule("MORNING", {
      conditions: { ...NO_SUGGESTION_CONDITIONS, hours: { from: "07:00", to: "11:00" } },
    });
    const noDrink = rule("NODRINK", {
      conditions: { ...NO_SUGGESTION_CONDITIONS, cartWithoutFamilyId: "fam-boissons" },
    });

    expect(ruleGate(morning, ask)).toBe("outside_hours");
    expect(ruleGate(noDrink, ask)).toBeNull();

    const triggering = cartTriggering({
      skus: ["COCA"],
      familyPaths: new Map([["COCA", ["fam-boissons"]]]),
    });
    const { rules: traced } = traceCandidates([noDrink], triggering);
    const diagnosed = diagnoseRules({
      live: [morning, noDrink],
      gateOf: (candidate) => ruleGate(candidate, ask),
      traced,
      refused: new Map(),
      shown: [],
    });

    expect(diagnosed.map(({ rule: one, verdict }) => [one.id, verdict.kind])).toEqual([
      ["NODRINK", "cart_has_family"],
      ["MORNING", "outside_hours"],
    ]);
  });
});
