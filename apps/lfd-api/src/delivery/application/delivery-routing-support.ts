import type { DeliveryUnlocatedReason } from "@lfd/contracts";

import type { DepartureCandidatesReader, DeliveryStopPoint } from "../channels/commerce/index.js";
import { DepartureNotLocatedError } from "../domain/errors/delivery-routing-errors.js";
import type { DepartureReader } from "../domain/ports/departure.reader.js";
import type { GeocodeCacheReader } from "../domain/ports/geocode-cache.reader.js";
import type { RoutingSettingsReader } from "../domain/ports/routing-settings.reader.js";
import { addressKeyOf } from "../domain/services/address-key.js";
import type { TimeWindow } from "../domain/services/route-timing.js";
import { minutesOfDay } from "../domain/value-objects/clock-time.js";
import { type GeoPoint, geoPoint } from "../domain/value-objects/geo-point.js";
import { RoutingSettings } from "../domain/value-objects/routing-settings.js";
import { departureViewOf } from "./departure-view.js";

/**
 * Les lectures que « Situer » et « Proposer » partagent (plan de tournée,
 * lot 7).
 */

/** Une entrée du cache plus vieille n'est plus crue ; « Situer » la rejoue (L7-C10). */
export const GEOCODE_TTL_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SECONDS_PER_MINUTE = 60;

/** La date avant laquelle une entrée du cache est périmée. */
export function geocodeFreshSince(now: Date): Date {
  return new Date(now.getTime() - GEOCODE_TTL_DAYS * MS_PER_DAY);
}

/** Les réglages posés, ou les défauts si personne n'a réglé. */
export async function routingSettingsOf(
  reader: RoutingSettingsReader,
): Promise<{ readonly settings: RoutingSettings; readonly source: "explicit" | "default" }> {
  const current = await reader.current();
  return current === null
    ? { settings: RoutingSettings.defaults(), source: "default" }
    : { settings: current, source: "explicit" };
}

/** Le point de départ et sa position. */
export interface LocatedDeparture {
  readonly pickupAddressId: string;
  readonly label: string;
  readonly point: GeoPoint;
}

/**
 * Le départ tel qu'il vaut (le choix, ou le défaut du commerce), SITUÉ.
 * @throws {DepartureNotLocatedError} aucun point, ou un point sans GPS.
 */
export async function locatedDeparture(
  reader: DepartureReader,
  candidates: DepartureCandidatesReader,
): Promise<LocatedDeparture> {
  const [chosenId, points] = await Promise.all([reader.chosenPickupAddressId(), candidates.list()]);
  const { point } = departureViewOf(chosenId, points);
  if (point === null) {
    throw new DepartureNotLocatedError(null);
  }
  if (point.gps === null) {
    throw new DepartureNotLocatedError(point.label);
  }
  return {
    pickupAddressId: point.pickupAddressId,
    label: point.label,
    point: geoPoint(point.gps.lat, point.gps.lng),
  };
}

/** Un arrêt situé — ou pas, avec la raison. */
export interface LocatedStop {
  readonly orderId: string;
  readonly reference: string;
  readonly point: GeoPoint | null;
  readonly unlocated: DeliveryUnlocatedReason | null;
  readonly window: TimeWindow | null;
}

/**
 * **Situe chaque arrêt** (L7-C1) sans sortir sur le réseau : le point GPS du
 * carnet d'abord, puis le cache du géocodage, sinon « non situé ». Jamais
 * inventé.
 */
export async function locateFromCache(
  points: readonly DeliveryStopPoint[],
  cache: GeocodeCacheReader,
  now: Date,
): Promise<readonly LocatedStop[]> {
  const keys = points.flatMap((point) =>
    point.gps === null && point.address !== null ? [addressKeyOf(point.address)] : [],
  );
  const cached = await cache.find(keys, geocodeFreshSince(now));
  return points.map((point) => {
    const fromCache = point.address === null ? undefined : cached.get(addressKeyOf(point.address));
    const located =
      point.gps === null ? (fromCache ?? null) : geoPoint(point.gps.lat, point.gps.lng);
    return {
      orderId: point.orderId,
      reference: point.reference,
      point: located,
      unlocated: located !== null ? null : point.address === null ? "no_address" : "not_geocoded",
      window: timeWindowOf(point.window),
    };
  });
}

/**
 * La fenêtre `HH:MM` en secondes depuis minuit ; illisible, elle ne compte pas.
 * Partagée avec le simulateur (lot 9), dont les arrêts inventés ont la même forme.
 */
export function timeWindowOf(window: DeliveryStopPoint["window"]): TimeWindow | null {
  if (window === null) {
    return null;
  }
  const end = minutesOfDay(window.end);
  if (end === null) {
    return null;
  }
  const start = window.start === null ? null : minutesOfDay(window.start);
  return {
    start: start === null ? null : start * SECONDS_PER_MINUTE,
    end: end * SECONDS_PER_MINUTE,
  };
}
