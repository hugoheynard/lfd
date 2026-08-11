import { ALERT_KINDS, type AccountAlertOverride, type AlertRuleView } from "@lfd/contracts";

import { activeRulesFor, resolveAccountRules } from "../account-alert-rules.js";
import { resolveGlobalRules } from "../alert-rules.js";

const GLOBALS: AlertRuleView[] = resolveGlobalRules([]);

const DRIFT = "product.quantity_drift";

/** Une règle « écart » propre au compte, reconnaissable à son sens surveillé. */
const OWN_RULE: AccountAlertOverride = {
  kind: DRIFT,
  mode: "custom",
  rule: {
    enabled: true,
    params: {
      kind: DRIFT,
      tiers: [{ upToQuantity: null, thresholdPercent: 300 }],
      direction: "up",
      baselineOrders: 4,
      minBaselineOrders: 2,
    },
    delivery: { staffInApp: false, staffEmail: true, customerVisible: false },
  },
};

describe("resolveAccountRules", () => {
  it("sans dérogation, le compte applique le global — et l'override reste null", () => {
    const [first] = resolveAccountRules(GLOBALS, []);

    expect(first.override).toBeNull();
    expect(first.effective).toEqual(first.global);
  });

  it("rappelle TOUJOURS la règle globale, même quand le compte y déroge", () => {
    const drift = resolveAccountRules(GLOBALS, [OWN_RULE]).find((row) => row.kind === DRIFT);

    // Le rappel est la raison d'être de l'écran : sans lui, on ne saurait pas de
    // quoi la dérogation dévie.
    expect(drift?.global).toEqual(ALERT_KINDS[DRIFT].defaults);
    expect(drift?.effective).toEqual(OWN_RULE.rule);
  });

  it("le mode off ÉTEINT la règle sans effacer ses paramètres", () => {
    const off: AccountAlertOverride = { kind: DRIFT, mode: "off" };

    const drift = resolveAccountRules(GLOBALS, [off]).find((row) => row.kind === DRIFT);

    expect(drift?.effective.enabled).toBe(false);
    // On garde les paramètres du global : c'est ce qui permet de dire
    // « désactivée » plutôt que « vide », et de la rallumer telle qu'elle était.
    expect(drift?.effective.params).toEqual(ALERT_KINDS[DRIFT].defaults.params);
  });

  it("ne laisse pas une dérogation contaminer les autres types", () => {
    const resolved = resolveAccountRules(GLOBALS, [OWN_RULE]);

    for (const row of resolved.filter((r) => r.kind !== DRIFT)) {
      expect(row.override).toBeNull();
      expect(row.effective).toEqual(row.global);
    }
  });
});

describe("activeRulesFor", () => {
  it("ne retient que ce qui sera réellement évalué", () => {
    const off: AccountAlertOverride = { kind: DRIFT, mode: "off" };

    const active = activeRulesFor(resolveAccountRules(GLOBALS, [off]));

    expect(active.has(DRIFT)).toBe(false);
    expect(active.has("product.first_order")).toBe(true);
  });
});
