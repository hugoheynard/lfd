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
    });
  });

  it("préfère la ligne stockée aux défauts, et date la vue", () => {
    const stored: StoredAlertRule = {
      kind: "product.quantity_drift",
      enabled: false,
      params: {
        kind: "product.quantity_drift",
        thresholdPercent: 120,
        direction: "up",
        baselineOrders: 10,
        minBaselineOrders: 4,
        minQuantity: 5,
      },
      delivery: { staffInApp: false, staffEmail: true, customerVisible: true },
      updatedAt: AT,
    };

    const drift = resolveGlobalRules([stored]).find((r) => r.kind === "product.quantity_drift");

    expect(drift).toEqual({
      kind: "product.quantity_drift",
      enabled: false,
      params: stored.params,
      delivery: stored.delivery,
      updatedAt: AT.toISOString(),
    });
  });

  it("ne laisse pas une ligne stockée déplacer l'ordre d'affichage", () => {
    const stored: StoredAlertRule = {
      kind: "product.quantity_drift",
      enabled: true,
      params: ALERT_KINDS["product.quantity_drift"].defaults.params,
      delivery: ALERT_KINDS["product.quantity_drift"].defaults.delivery,
      updatedAt: AT,
    };

    // L'ordre vient de l'énuméré, pas de ce que la base rend en premier.
    expect(resolveGlobalRules([stored]).map((r) => r.kind)).toEqual([...ALERT_KIND_ORDER]);
  });
});
