import type { Proposal } from "../proposal.js";
import type { CompositionZones } from "../zone-rule.js";

/**
 * Les arrêts d'une proposition posés dans un véhicule qui n'est pas autorisé
 * sur leur zone — `véhicule:arrêt`. Ce que le banc et les tests vérifient :
 * la règle est une contrainte dure, ce compte est toujours vide.
 */
export function outOfZoneStops(
  proposal: Proposal,
  zones: CompositionZones | undefined,
): readonly string[] {
  if (zones === undefined) {
    return [];
  }
  return proposal.tours.flatMap((tour) => {
    const allowed = zones.vehicles.get(tour.vehicleId);
    return tour.stops.flatMap((stop) => {
      const zone = zones.stops.get(stop.id);
      return allowed === undefined || zone === undefined || allowed.has(zone)
        ? []
        : [`${tour.vehicleId}:${stop.id}`];
    });
  });
}
