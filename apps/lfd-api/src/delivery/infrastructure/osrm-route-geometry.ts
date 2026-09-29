import { Logger } from "@nestjs/common";

import { RouteGeometry, type RouteLine } from "../domain/ports/route-geometry.js";
import type { GeoPoint } from "../domain/value-objects/geo-point.js";
import type { FetchFn } from "./ban-geocoder.js";
import { osrmGet } from "./osrm-fetch.js";

/**
 * Le délai d'un tracé. Plus court que celui de la table : quand on trace,
 * `/table` vient de répondre, l'instance est réveillée.
 */
export const OSRM_ROUTE_TIMEOUT_MS = 10_000;

/**
 * **Le tracé par la route** (L10b-C4) : `GET /route` d'OSRM,
 * `overview=simplified` (quelques dizaines de points par tournée, assez pour
 * une carte de vallée) et `geometries=geojson` (des paires `[lng, lat]`, sans
 * décodage de polyligne).
 *
 * Tout échec rend `null` et se note au journal — jamais une erreur : un
 * dessin manquant ne refuse pas une proposition.
 */
export class OsrmRouteGeometry extends RouteGeometry {
  private readonly logger = new Logger("Tracé des tournées");

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
    private readonly timeoutMs: number = OSRM_ROUTE_TIMEOUT_MS,
  ) {
    super();
  }

  async trace(waypoints: readonly GeoPoint[]): Promise<RouteLine | null> {
    if (waypoints.length < 2) {
      return null;
    }
    // OSRM lit `longitude,latitude`, dans cet ordre.
    const path = waypoints.map((point) => `${String(point.lng)},${String(point.lat)}`).join(";");
    const url = `${this.baseUrl.replace(/\/+$/u, "")}/route/v1/driving/${path}?overview=simplified&geometries=geojson`;
    const outcome = await osrmGet(this.fetchFn, url, this.timeoutMs, lineOf);
    if ("value" in outcome) {
      return outcome.value;
    }
    this.logger.warn(`OSRM n'a pas rendu de tracé (${outcome.failure}) : carte sans ligne.`);
    return null;
  }
}

/** `routes[0].geometry.coordinates`, lu défensivement : il vient du réseau. */
function lineOf(body: unknown): RouteLine | null {
  if (typeof body !== "object" || body === null || !("code" in body) || body.code !== "Ok") {
    return null;
  }
  const route: unknown = "routes" in body && Array.isArray(body.routes) ? body.routes[0] : null;
  if (typeof route !== "object" || route === null || !("geometry" in route)) {
    return null;
  }
  const geometry = route.geometry;
  if (typeof geometry !== "object" || geometry === null || !("coordinates" in geometry)) {
    return null;
  }
  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }
  const line = coordinates.flatMap((pair: unknown): [number, number][] =>
    Array.isArray(pair) &&
    pair.length === 2 &&
    typeof pair[0] === "number" &&
    typeof pair[1] === "number"
      ? [[pair[0], pair[1]]]
      : [],
  );
  return line.length === coordinates.length ? line : null;
}
