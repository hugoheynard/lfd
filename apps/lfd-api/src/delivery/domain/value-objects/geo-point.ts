import { InvalidGeoPointError } from "../errors/delivery-routing-errors.js";

/** Un point en degrés décimaux (WGS 84). */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

/**
 * Un point GPS vérifié : fini, dans les bornes terrestres.
 * @throws {InvalidGeoPointError}
 */
export function geoPoint(lat: number, lng: number): GeoPoint {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > MAX_LATITUDE ||
    Math.abs(lng) > MAX_LONGITUDE
  ) {
    throw new InvalidGeoPointError();
  }
  return { lat, lng };
}
