import { RoutingSettings } from "../../value-objects/routing-settings.js";
import type { PlanningContext } from "../proposal.js";
import { sectorRuleOf, sectorsOf } from "../sectors.js";
import { NO_ZONE_RULE, zoneRuleOf } from "../zone-rule.js";
import { planeCost } from "./line-cost.js";

/** Deux vallées : trois arrêts à l'est, trois à l'ouest, le dépôt au milieu. */
const POSITIONS: Readonly<Record<string, readonly [number, number]>> = {
  depot: [0, 0],
  e1: [10, 0],
  e2: [12, 1],
  e3: [14, -1],
  w1: [-10, 0],
  w2: [-12, 1],
  w3: [-14, -1],
};
const STOPS = ["e1", "e2", "e3", "w1", "w2", "w3"].map((id) => ({ id, window: null }));
const ctx: PlanningContext = {
  depotId: "depot",
  cost: planeCost(POSITIONS),
  settings: RoutingSettings.defaults(),
};
const vehicle = (id: string, passages = 1) => ({ id, passages });

describe("sectorsOf — un secteur par véhicule, par temps de route", () => {
  it("donne une vallée à chaque camionnette", () => {
    const sectors = sectorsOf(ctx, STOPS, [vehicle("v1"), vehicle("v2")], undefined);

    const east = new Set(["e1", "e2", "e3"].map((id) => sectors.get(id)));
    const west = new Set(["w1", "w2", "w3"].map((id) => sectors.get(id)));
    expect(east.size).toBe(1);
    expect(west.size).toBe(1);
    expect([...east][0]).not.toBe([...west][0]);
  });

  it("taille les parts selon ce que le véhicule peut faire : deux tournées, deux fois plus d'arrêts", () => {
    const sectors = sectorsOf(ctx, STOPS, [vehicle("v1", 2), vehicle("v2", 1)], undefined);

    const count = (id: string) => [...sectors.values()].filter((owner) => owner === id).length;
    expect(count("v1")).toBe(4);
    expect(count("v2")).toBe(2);
  });

  it("un seul véhicule utile, ou aucun arrêt : pas de secteur", () => {
    expect(sectorsOf(ctx, STOPS, [vehicle("v1"), vehicle("v2", 0)], undefined).size).toBe(0);
    expect(sectorsOf(ctx, [], [vehicle("v1"), vehicle("v2")], undefined).size).toBe(0);
  });

  it("est déterministe", () => {
    const once = sectorsOf(ctx, STOPS, [vehicle("v1"), vehicle("v2")], undefined);
    const twice = sectorsOf(ctx, [...STOPS].reverse(), [vehicle("v1"), vehicle("v2")], undefined);

    expect([...twice].sort()).toEqual([...once].sort());
  });
});

describe("sectorRuleOf — le secteur EN PLUS des zones réelles", () => {
  const sectors = new Map([
    ["e1", "v1"],
    ["w1", "v2"],
  ]);

  it("ne laisse à un véhicule que son secteur ; un arrêt hors secteur va partout", () => {
    const rule = sectorRuleOf(sectors, NO_ZONE_RULE);

    expect(rule.allows("v1", "e1")).toBe(true);
    expect(rule.allows("v1", "w1")).toBe(false);
    expect(rule.allows("v2", "inconnu")).toBe(true);
  });

  it("une zone réelle qui refuse refuse encore", () => {
    const zones = zoneRuleOf({
      vehicles: new Map([["v1", new Set(["nord"])]]),
      stops: new Map([["e1", "sud"]]),
    });

    expect(sectorRuleOf(sectors, zones).allows("v1", "e1")).toBe(false);
  });
});
