import { UnknownCostPointError } from "../errors/delivery-routing-errors.js";
import { type CostFn, DistanceMatrix, type EstimatedCost } from "../ports/distance-matrix.js";
import type { GeoPoint } from "../value-objects/geo-point.js";
import type { RoutingSettings } from "../value-objects/routing-settings.js";

/** Rayon moyen de la Terre (IUGG), en mètres. */
const EARTH_RADIUS_METERS = 6_371_008.8;
const PERCENT = 100;
const METERS_PER_KM = 1000;
const SECONDS_PER_HOUR = 3600;

/** La distance à vol d'oiseau entre deux points, en mètres (formule de haversine). */
export function haversineMeters(from: GeoPoint, to: GeoPoint): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * La matrice **à vol d'oiseau** (L7-C2) : haversine × facteur de détour, puis
 * divisée par la vitesse moyenne. Grossière en montagne, et l'écran le dit
 * (« estimation à vol d'oiseau ») ; symétrique, ce qu'une matrice routière ne
 * sera pas — l'ordonnanceur est déjà asymétrique (ATSP).
 *
 * Pure : aucun appel réseau, aucun aléa. Calculée une fois pour toutes les
 * paires.
 */
export class CrowFliesDistanceMatrix extends DistanceMatrix {
  build(points: ReadonlyMap<string, GeoPoint>, settings: RoutingSettings): Promise<EstimatedCost> {
    return Promise.resolve({ ...crowFliesCost(points, settings), estimate: "crow_flies" });
  }
}

/** La version synchrone de {@link CrowFliesDistanceMatrix}. */
export function crowFliesCost(
  points: ReadonlyMap<string, GeoPoint>,
  settings: RoutingSettings,
): CostFn {
  const ids = [...points.keys()];
  const index = new Map(ids.map((id, position) => [id, position]));
  const meters = ids.map((fromId) =>
    ids.map(
      (toId) =>
        (haversineMeters(pointOf(points, fromId), pointOf(points, toId)) * settings.detourPercent) /
        PERCENT,
    ),
  );
  const metersPerSecond = (settings.averageSpeedKmh * METERS_PER_KM) / SECONDS_PER_HOUR;
  const lookup = (fromId: string, toId: string): number => {
    const from = index.get(fromId);
    const to = index.get(toId);
    const row = from === undefined ? undefined : meters[from];
    const value = to === undefined ? undefined : row?.[to];
    if (value === undefined) {
      throw new UnknownCostPointError(from === undefined ? fromId : toId);
    }
    return value;
  };
  return {
    meters: lookup,
    seconds: (fromId, toId) => lookup(fromId, toId) / metersPerSecond,
  };
}

function pointOf(points: ReadonlyMap<string, GeoPoint>, id: string): GeoPoint {
  const point = points.get(id);
  if (point === undefined) {
    throw new UnknownCostPointError(id);
  }
  return point;
}
