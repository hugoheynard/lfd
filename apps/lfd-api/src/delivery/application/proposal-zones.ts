import type { CompositionZones } from "../domain/services/zone-rule.js";
import type { ChosenVehicle } from "./delivery-proposal-support.js";
import type { LocatedStop } from "./delivery-routing-support.js";

/**
 * **Les zones de la proposition** (composition-automatique.md §4,
 * 2026-10-06) : seuls les véhicules RESTREINTS y entrent — sans aucun, la
 * règle ne refuse rien et le calcul est celui d'avant —, et seules les
 * commandes dont la zone est connue.
 */
export function compositionZonesOf(
  vehicles: readonly ChosenVehicle[],
  stops: ReadonlyMap<string, LocatedStop>,
): CompositionZones {
  return {
    vehicles: new Map(
      vehicles
        .filter((vehicle) => vehicle.allowedZoneIds.length > 0)
        .map((vehicle) => [vehicle.id, new Set(vehicle.allowedZoneIds)]),
    ),
    stops: new Map(
      [...stops.values()].flatMap((stop) =>
        stop.zoneId === null ? [] : [[stop.orderId, stop.zoneId] as const],
      ),
    ),
  };
}
