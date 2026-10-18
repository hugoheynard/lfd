import { addDays, weekdayOfDate } from "@lfd/contracts";

import {
  StaffSuggestionRule,
  type StaffSuggestionRuleInput,
  type StaffSuggestionRuleSnapshot,
} from "../../entities/staff-suggestion-rule.js";
import {
  alertWindow,
  conditionFindings,
  readersOf,
  ruleAlert,
  watchedRules,
  type AudienceFacts,
} from "../suggestion-alerts.js";
import { NO_SUGGESTION_CONDITIONS } from "../../value-objects/suggestion-conditions.js";

/** Les jours ne sont comparés qu'à `TODAY`, passé aux fonctions. */
const TODAY = "2026-10-18";

function rule(
  id: string,
  over: Partial<StaffSuggestionRuleInput> & {
    readonly active?: boolean;
    readonly archived?: boolean;
  } = {},
): StaffSuggestionRuleSnapshot {
  const { active = true, archived = false, ...fields } = over;
  const at = new Date(Date.UTC(2026, 9, 1, 8));
  return StaffSuggestionRule.reconstitute({
    id,
    trigger: { kind: "everywhere", ref: null },
    suggestedSkus: ["BOI-001", "PAI-001"],
    placement: "home",
    audience: "both",
    startsOn: TODAY,
    endsOn: addDays(TODAY, 5),
    phrase: null,
    priority: 0,
    conditions: NO_SUGGESTION_CONDITIONS,
    ...fields,
    active,
    created: { by: null, at },
    lastWrite: { by: null, at },
    archivedAt: archived ? at : null,
  }).snapshot();
}

function facts(
  audience: "pro" | "public",
  over: Partial<Omit<AudienceFacts, "audience">> = {},
): AudienceFacts {
  return { audience, notServed: new Map(), neverOrderable: new Set(), ...over };
}

describe("watchedRules", () => {
  it("ne surveille ni l'archivée, ni la coupée, ni la finie ; garde l'en cours et l'à venir", () => {
    const rules = [
      rule("ARCHIVED", { archived: true }),
      rule("OFF", { active: false }),
      rule("ENDED", { startsOn: addDays(TODAY, -5), endsOn: addDays(TODAY, -1) }),
      rule("LAST_DAY", { startsOn: addDays(TODAY, -5), endsOn: TODAY }),
      rule("LATER", { startsOn: addDays(TODAY, 40), endsOn: addDays(TODAY, 50) }),
    ];
    expect(watchedRules(rules, TODAY).map(({ id }) => id)).toEqual(["LAST_DAY", "LATER"]);
  });
});

describe("readersOf", () => {
  it("« pour tous » atteint les deux clientèles, sinon la sienne", () => {
    expect(readersOf(rule("R"))).toEqual(["pro", "public"]);
    expect(readersOf(rule("R", { audience: "pro" }))).toEqual(["pro"]);
  });
});

describe("alertWindow", () => {
  it("part d'aujourd'hui pour une règle en cours, et finit à sa fin", () => {
    const window = alertWindow(rule("R", { startsOn: addDays(TODAY, -3) }), TODAY);
    expect(window).toMatchObject({ from: TODAY, to: addDays(TODAY, 5), capped: false });
    expect(window?.days).toHaveLength(6);
  });

  it("borne une longue période à 31 jours, et le dit", () => {
    const window = alertWindow(rule("R", { endsOn: addDays(TODAY, 90) }), TODAY);
    expect(window).toMatchObject({ from: TODAY, to: addDays(TODAY, 30), capped: true });
    expect(window?.days).toHaveLength(31);
  });

  it("part du début d'une règle à venir ; rien au-delà de l'horizon", () => {
    expect(alertWindow(rule("R", { startsOn: addDays(TODAY, 2) }), TODAY)?.from).toBe(
      addDays(TODAY, 2),
    );
    expect(
      alertWindow(rule("R", { startsOn: addDays(TODAY, 31), endsOn: addDays(TODAY, 40) }), TODAY),
    ).toBeNull();
  });
});

describe("ruleAlert", () => {
  const window = { from: TODAY, to: addDays(TODAY, 5), capped: false };

  it("une règle saine ne rend rien", () => {
    expect(ruleAlert(rule("R"), false, [facts("pro"), facts("public")], window)).toBeNull();
  });

  it("partielle : un article ne passe plus, l'autre si — la raison par clientèle", () => {
    const alert = ruleAlert(
      rule("R"),
      false,
      [facts("pro"), facts("public", { notServed: new Map([["BOI-001", "not_for_audience"]]) })],
      window,
    );
    expect(alert).toEqual({
      ruleId: "R",
      severity: "partial",
      triggerWithdrawn: false,
      conditions: [],
      items: [{ sku: "BOI-001", audience: "public", reason: "not_for_audience" }],
      window,
    });
  });

  it("un article servi aux pros seulement passe encore : la règle n'est pas vide", () => {
    const alert = ruleAlert(
      rule("R", { suggestedSkus: ["BOI-001"] }),
      false,
      [facts("pro"), facts("public", { notServed: new Map([["BOI-001", "hidden_for_audience"]]) })],
      window,
    );
    expect(alert?.severity).toBe("partial");
  });

  it("vide : aucun article ne passe — retiré une fois pour tous, jamais commandable", () => {
    const alert = ruleAlert(
      rule("R"),
      false,
      [
        facts("pro", {
          notServed: new Map([["BOI-001", "withdrawn"]]),
          neverOrderable: new Set(["PAI-001"]),
        }),
        facts("public", {
          notServed: new Map([["BOI-001", "withdrawn"]]),
          neverOrderable: new Set(["PAI-001"]),
        }),
      ],
      window,
    );
    expect(alert?.severity).toBe("empty");
    expect(alert?.items).toEqual([
      { sku: "BOI-001", audience: null, reason: "withdrawn" },
      { sku: "PAI-001", audience: "pro", reason: "never_orderable" },
      { sku: "PAI-001", audience: "public", reason: "never_orderable" },
    ]);
  });

  it("un déclencheur mort rend la règle vide, articles sains compris", () => {
    const alert = ruleAlert(rule("R"), true, [facts("pro"), facts("public")], null);
    expect(alert).toEqual({
      ruleId: "R",
      severity: "empty",
      triggerWithdrawn: true,
      conditions: [],
      items: [],
      window: null,
    });
  });
});

describe("conditionFindings — RS8", () => {
  const withSites = (ids: readonly string[]) =>
    rule("R", { conditions: { ...NO_SUGGESTION_CONDITIONS, pickupAddressIds: ids } });

  it("un point fermé sur deux : signalé, la règle vit encore", () => {
    const found = conditionFindings(withSites(["site-a", "site-b"]), new Set(["site-a"]), null);
    expect(found).toEqual({
      alerts: [{ reason: "site_closed", siteId: "site-b" }],
      blocking: false,
    });
  });

  it("tous les points fermés : la règle est vide", () => {
    const r = withSites(["site-a"]);
    const found = conditionFindings(r, new Set(), null);
    expect(found.blocking).toBe(true);
    expect(ruleAlert(r, false, [facts("pro"), facts("public")], null, found)?.severity).toBe(
      "empty",
    );
  });

  it("aucun des jours choisis dans ce qui reste de la période : vide ; un seul suffit", () => {
    const today = weekdayOfDate(TODAY);
    const tomorrow = weekdayOfDate(addDays(TODAY, 1));
    const oneDay = (weekdays: readonly string[]) =>
      rule("R", {
        endsOn: TODAY,
        conditions: { ...NO_SUGGESTION_CONDITIONS, weekdays },
      });
    const window = (r: StaffSuggestionRuleSnapshot) => alertWindow(r, TODAY);

    const missed = oneDay([tomorrow]);
    expect(conditionFindings(missed, new Set(), window(missed))).toEqual({
      alerts: [{ reason: "no_weekday_left", siteId: null }],
      blocking: true,
    });
    const hit = oneDay([today]);
    expect(conditionFindings(hit, new Set(), window(hit)).alerts).toEqual([]);
  });

  it("une fenêtre plafonnée couvre la semaine : rien n'est dit des jours", () => {
    const long = rule("R", {
      endsOn: addDays(TODAY, 90),
      conditions: { ...NO_SUGGESTION_CONDITIONS, weekdays: ["mon"] },
    });
    expect(conditionFindings(long, new Set(), alertWindow(long, TODAY)).alerts).toEqual([]);
  });
});
