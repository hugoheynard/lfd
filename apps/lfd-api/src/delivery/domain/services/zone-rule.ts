import type { Routes } from "./vehicle-plan.js";

/**
 * **Ce que la composition sait des zones** (composition-automatique.md §4,
 * 2026-10-06) : les zones autorisées de chaque véhicule restreint, et la zone
 * de chaque commande qui en a une. Un véhicule absent de `vehicles` va
 * partout ; une commande absente de `stops` aussi (sans zone connue, la règle
 * ne bloque pas).
 */
export interface CompositionZones {
  readonly vehicles: ReadonlyMap<string, ReadonlySet<string>>;
  readonly stops: ReadonlyMap<string, string>;
}

/**
 * **La règle des zones** : un arrêt n'est jamais ESSAYÉ dans un véhicule qui
 * n'est pas autorisé sur sa zone. Une contrainte dure, comme la capacité
 * (CA4), mais jugée AVANT le score : elle ne coûte qu'une lecture.
 */
export interface ZoneRule {
  /** Faux : aucun véhicule n'est restreint, la règle ne refuse rien. */
  readonly restricts: boolean;
  allows(vehicleId: string, stopId: string): boolean;
  /**
   * Les tournées que ce véhicule recevrait ne portent-elles que des arrêts
   * qu'il peut livrer ? Un arrêt épinglé (`pinned`) y est admis : posé à la
   * main, il n'est pas défait (§4), et il ne quitte pas son véhicule.
   */
  admits(vehicleId: string, routes: Routes, pinned: ReadonlySet<string>): boolean;
}

/** Sans zones fournies (simulateur, chronométrage, tests de l'horaire) : rien n'est refusé. */
export const NO_ZONE_RULE: ZoneRule = {
  restricts: false,
  allows: () => true,
  admits: () => true,
};

/** La règle d'une journée ; sans véhicule restreint, c'est {@link NO_ZONE_RULE}. */
export function zoneRuleOf(zones: CompositionZones | undefined): ZoneRule {
  if (zones === undefined || zones.vehicles.size === 0) {
    return NO_ZONE_RULE;
  }
  const allows = (vehicleId: string, stopId: string): boolean => {
    const allowed = zones.vehicles.get(vehicleId);
    const zone = zones.stops.get(stopId);
    return allowed === undefined || zone === undefined || allowed.has(zone);
  };
  return {
    restricts: true,
    allows,
    admits: (vehicleId, routes, pinned) =>
      routes.every(({ stops }) =>
        stops.every((stop) => pinned.has(stop.id) || allows(vehicleId, stop.id)),
      ),
  };
}
