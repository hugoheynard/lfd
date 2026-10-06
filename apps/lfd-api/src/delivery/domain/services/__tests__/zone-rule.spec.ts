import { NO_ZONE_RULE, zoneRuleOf } from "../zone-rule.js";

const zones = {
  vehicles: new Map([["v_kangoo", new Set(["nord"])]]),
  stops: new Map([
    ["a", "nord"],
    ["b", "sud"],
  ]),
};

describe("la règle des zones", () => {
  it("sans véhicule restreint, c'est la règle qui ne refuse rien", () => {
    expect(zoneRuleOf(undefined)).toBe(NO_ZONE_RULE);
    expect(zoneRuleOf({ vehicles: new Map(), stops: zones.stops })).toBe(NO_ZONE_RULE);
  });

  it("un véhicule restreint ne prend que sa zone ; un autre, et une commande sans zone, partout", () => {
    const rule = zoneRuleOf(zones);
    expect(rule.restricts).toBe(true);
    expect(rule.allows("v_kangoo", "a")).toBe(true);
    expect(rule.allows("v_kangoo", "b")).toBe(false);
    expect(rule.allows("v_kangoo", "sans_zone")).toBe(true);
    expect(rule.allows("v_trafic", "b")).toBe(true);
  });

  it("admet des tournées hors zone seulement pour un arrêt épinglé", () => {
    const rule = zoneRuleOf(zones);
    const routes = [
      {
        roundId: "r1",
        stops: [
          { id: "a", window: null },
          { id: "b", window: null },
        ],
      },
    ];
    expect(rule.admits("v_kangoo", routes, new Set())).toBe(false);
    expect(rule.admits("v_kangoo", routes, new Set(["b"]))).toBe(true);
  });
});
