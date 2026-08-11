import { ALERT_KINDS, ALERT_KIND_ORDER } from "@lfd/contracts";

import { resolveGlobalRules, type StoredAlertRule } from "../alert-rules.js";

const AT = new Date("2026-08-11T09:00:00.000Z");

describe("resolveGlobalRules", () => {
  it("sert TOUS les types connus, même quand la table est vide", () => {
    const rules = resolveGlobalRules([]);

    expect(rules.map((r) => r.kind)).toEqual([...ALERT_KIND_ORDER]);
  });

  it("rend les défauts du type, et un updatedAt null, quand personne n'y a touché", () => {
    const [first] = resolveGlobalRules([]);

    // `null` et pas une date inventée : l'écran doit pouvoir dire « jamais réglé ».
    expect(first).toEqual({
      kind: "product.first_order",
      ...ALERT_KINDS["product.first_order"].defaults,
      updatedAt: null,
      updatedBy: null,
      degraded: false,
    });
  });

  it("préfère la ligne stockée aux défauts, et date la vue", () => {
    const stored: StoredAlertRule = {
      kind: "product.quantity_drift",
      readable: true,
      updatedBy: "staff|hugo",
      enabled: false,
      params: {
        kind: "product.quantity_drift",
        riseTiers: [{ upToQuantity: null, thresholdPercent: 120 }],
        dropTiers: [{ upToQuantity: null, thresholdPercent: 60 }],
        direction: "up",
        baselineOrders: 10,
        minBaselineOrders: 4,
        windowDays: 90,
      },
      delivery: { staffInApp: false, staffEmail: true, customerVisible: true },
      updatedAt: AT,
    };

    const drift = resolveGlobalRules([stored]).find((r) => r.kind === "product.quantity_drift");

    expect(drift).toEqual({
      kind: "product.quantity_drift",
      enabled: false,
      params: stored.readable ? stored.params : null,
      delivery: stored.readable ? stored.delivery : null,
      updatedAt: AT.toISOString(),
      updatedBy: "staff|hugo",
      degraded: false,
    });
  });

  it("ne laisse pas une ligne stockée déplacer l'ordre d'affichage", () => {
    const stored: StoredAlertRule = {
      kind: "product.quantity_drift",
      readable: true,
      updatedBy: null,
      enabled: true,
      params: ALERT_KINDS["product.quantity_drift"].defaults.params,
      delivery: ALERT_KINDS["product.quantity_drift"].defaults.delivery,
      updatedAt: AT,
    };

    // L'ordre vient de l'énuméré, pas de ce que la base rend en premier.
    expect(resolveGlobalRules([stored]).map((r) => r.kind)).toEqual([...ALERT_KIND_ORDER]);
  });
});

/**
 * Régression : une ligne illisible était silencieusement ignorée, donc son type
 * repartait aux défauts — `customerVisible` compris. Un message client coupé
 * pouvait ainsi revenir tout seul.
 */
describe("règle illisible", () => {
  const UNREADABLE: StoredAlertRule = {
    kind: "product.quantity_drift",
    readable: false,
    updatedAt: AT,
    updatedBy: null,
  };

  it("l'avoue au lieu de faire comme si de rien n'était", () => {
    const drift = resolveGlobalRules([UNREADABLE]).find((r) => r.kind === "product.quantity_drift");

    expect(drift?.degraded).toBe(true);
    expect(drift?.updatedAt).toBe(AT.toISOString());
  });

  it("ne parle JAMAIS au client en repli", () => {
    const drift = resolveGlobalRules([UNREADABLE]).find((r) => r.kind === "product.quantity_drift");

    // Du bruit côté staff est réparable ; un message qui réapparaît chez un
    // client sans que personne l'ait décidé ne l'est pas.
    expect(drift?.delivery.customerVisible).toBe(false);
  });

  it("laisse les autres types intacts", () => {
    const others = resolveGlobalRules([UNREADABLE]).filter(
      (r) => r.kind !== "product.quantity_drift",
    );

    expect(others.every((r) => !r.degraded)).toBe(true);
  });
});
