import { ALERT_KINDS, type AccountAlertOverride, type AlertRuleView } from "@lfd/contracts";

import type { StoredOverride } from "../account-alert-rules.js";

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
      riseTiers: [{ upToQuantity: null, thresholdPercent: 300 }],
      dropTiers: [{ upToQuantity: null, thresholdPercent: 60 }],
      direction: "up",
      baselineOrders: 4,
      minBaselineOrders: 2,
      windowDays: 180,
    },
    delivery: { staffInApp: false, staffEmail: true, customerVisible: false },
  },
};

const AT = new Date("2026-08-11T09:00:00.000Z");

/** Une dérogation lisible, telle que le store la rend. */
function stored(override: AccountAlertOverride, updatedAt = AT): StoredOverride {
  return { readable: true, override, updatedAt, updatedBy: "staff|hugo" };
}

describe("resolveAccountRules", () => {
  it("sans dérogation, le compte applique le global — et l'override reste null", () => {
    const [first] = resolveAccountRules(GLOBALS, []);

    expect(first!.override).toBeNull();
    expect(first!.effective).toEqual(first!.global);
  });

  it("rappelle TOUJOURS la règle globale, même quand le compte y déroge", () => {
    const drift = resolveAccountRules(GLOBALS, [stored(OWN_RULE)]).find(
      (row) => row.kind === DRIFT,
    );

    // Le rappel est la raison d'être de l'écran : sans lui, on ne saurait pas de
    // quoi la dérogation dévie.
    expect(drift?.global).toEqual(ALERT_KINDS[DRIFT].defaults);
    expect(drift?.effective).toEqual(OWN_RULE.rule);
  });

  it("le mode off ÉTEINT la règle sans effacer ses paramètres", () => {
    const off: AccountAlertOverride = { kind: DRIFT, mode: "off" };

    const drift = resolveAccountRules(GLOBALS, [stored(off)]).find((row) => row.kind === DRIFT);

    expect(drift?.effective.enabled).toBe(false);
    // On garde les paramètres du global : c'est ce qui permet de dire
    // « désactivée » plutôt que « vide », et de la rallumer telle qu'elle était.
    expect(drift?.effective.params).toEqual(ALERT_KINDS[DRIFT].defaults.params);
  });

  it("ne laisse pas une dérogation contaminer les autres types", () => {
    const resolved = resolveAccountRules(GLOBALS, [stored(OWN_RULE)]);

    for (const row of resolved.filter((r) => r.kind !== DRIFT)) {
      expect(row.override).toBeNull();
      expect(row.effective).toEqual(row.global);
    }
  });
});

describe("activeRulesFor", () => {
  it("ne retient que ce qui sera réellement évalué", () => {
    const off: AccountAlertOverride = { kind: DRIFT, mode: "off" };

    const active = activeRulesFor(resolveAccountRules(GLOBALS, [stored(off)]));

    expect(active.has(DRIFT)).toBe(false);
    expect(active.has("product.first_order")).toBe(true);
  });
});

describe("dérogation illisible", () => {
  /**
   * Régression : une dérogation qu'on ne sait plus relire était avalée, donc le
   * compte redevenait surveillé — et l'écran affirmait sereinement « suit le
   * réglage global ». On sait au moins qu'il avait refusé ce global.
   */
  it("se comporte comme un `off` et l'avoue", () => {
    const broken: StoredOverride = {
      readable: false,
      kind: DRIFT,
      updatedAt: AT,
      updatedBy: null,
    };

    const drift = resolveAccountRules(GLOBALS, [broken]).find((row) => row.kind === DRIFT);

    expect(drift?.effective.enabled).toBe(false);
    expect(drift?.override).toEqual({ kind: DRIFT, mode: "off" });
    expect(drift?.degraded).toBe(true);
  });
});

describe("dérive du réglage global", () => {
  const OLD = new Date("2026-01-01T00:00:00.000Z");

  it("signale un global écrit APRÈS la dérogation", () => {
    // Le prix du tout-ou-rien : le compte ne suit plus les évolutions de la
    // plateforme, et rien d'autre ne le dirait — on ne remarque pas une alerte
    // qui n'arrive pas.
    const globals: AlertRuleView[] = GLOBALS.map((view) =>
      view.kind === DRIFT ? { ...view, updatedAt: AT.toISOString() } : view,
    );

    const drift = resolveAccountRules(globals, [stored(OWN_RULE, OLD)]).find(
      (row) => row.kind === DRIFT,
    );

    expect(drift?.globalMovedSince).toBe(true);
  });

  it("ne crie pas quand la dérogation est la plus récente", () => {
    const globals: AlertRuleView[] = GLOBALS.map((view) =>
      view.kind === DRIFT ? { ...view, updatedAt: OLD.toISOString() } : view,
    );

    const drift = resolveAccountRules(globals, [stored(OWN_RULE, AT)]).find(
      (row) => row.kind === DRIFT,
    );

    expect(drift?.globalMovedSince).toBe(false);
  });
});

describe("l'auteur d'une dérogation", () => {
  it("voyage avec elle — « qui a coupé les alertes ici ? » doit rester répondable", () => {
    const drift = resolveAccountRules(GLOBALS, [stored(OWN_RULE)]).find(
      (row) => row.kind === DRIFT,
    );

    expect(drift?.overrideUpdatedBy).toBe("staff|hugo");
  });

  it("reste null quand le compte suit le réglage global", () => {
    const [first] = resolveAccountRules(GLOBALS, []);

    expect(first!.overrideUpdatedBy).toBeNull();
  });
});
