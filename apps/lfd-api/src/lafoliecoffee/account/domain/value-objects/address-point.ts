import type { GpsPoint } from "@lfd/contracts";

import { InvalidAddressPointError } from "../errors/address-point-errors.js";

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

/**
 * **Un point d'une adresse de livraison** — la porte ou le stationnement
 * (`gps-y-aller-et-position.md`, §6). Fini, dans les bornes terrestres ;
 * rend une copie, jamais l'objet reçu.
 *
 * @throws {InvalidAddressPointError}
 */
export function addressPointOf(point: GpsPoint): GpsPoint {
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    Math.abs(point.lat) > MAX_LATITUDE ||
    Math.abs(point.lng) > MAX_LONGITUDE
  ) {
    throw new InvalidAddressPointError();
  }
  return { lat: point.lat, lng: point.lng };
}
