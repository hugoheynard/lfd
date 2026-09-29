import { UnknownCostPointError } from "../../errors/delivery-routing-errors.js";
import type { GeoPoint } from "../../value-objects/geo-point.js";
import { type CostFn, DistanceMatrix } from "../distance-matrix.js";
import { RouteGeometry, type RouteLine } from "../route-geometry.js";

/** Rayon moyen de la Terre (IUGG), en mètres. */
const EARTH_RADIUS_METERS = 6_371_008.8;
/** La ligne droite × 1,4 : l'ancien défaut du vol d'oiseau, gardé pour que les ordres de grandeur parlent. */
const DETOUR = 1.4;
/** 35 km/h, en mètres par seconde. */
const METERS_PER_SECOND = 35_000 / 3600;

function straightMeters(from: GeoPoint, to: GeoPoint): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * **Un double de la route**, déterministe et sans réseau : la ligne droite
 * × 1,4 à 35 km/h. Ce n'est PAS un repli de production — il n'y en a plus
 * (L10b-C5) — : c'est ce qui laisse les suites unitaires et e2e éprouver
 * l'algorithme et le SQL sans OSRM. Il note chaque matrice demandée.
 */
export class StraightLineDistanceMatrix extends DistanceMatrix {
  readonly requested: ReadonlyMap<string, GeoPoint>[] = [];

  build(points: ReadonlyMap<string, GeoPoint>): Promise<CostFn> {
    this.requested.push(points);
    const pointOf = (id: string): GeoPoint => {
      const point = points.get(id);
      if (point === undefined) {
        throw new UnknownCostPointError(id);
      }
      return point;
    };
    const meters = (fromId: string, toId: string): number =>
      straightMeters(pointOf(fromId), pointOf(toId)) * DETOUR;
    return Promise.resolve({
      meters,
      seconds: (fromId, toId) => meters(fromId, toId) / METERS_PER_SECOND,
    });
  }
}

/**
 * **Un tracé doublé** : la ligne brisée qui relie les points demandés, en
 * `[lng, lat]`. Il note chaque tracé demandé ; `fails` le rend muet (`null`),
 * comme OSRM quand il ne trace pas.
 */
export class StraightRouteGeometry extends RouteGeometry {
  readonly requested: (readonly GeoPoint[])[] = [];

  constructor(private readonly fails: boolean = false) {
    super();
  }

  trace(waypoints: readonly GeoPoint[]): Promise<RouteLine | null> {
    this.requested.push(waypoints);
    return Promise.resolve(
      this.fails
        ? null
        : waypoints.map((point): readonly [number, number] => [point.lng, point.lat]),
    );
  }
}
