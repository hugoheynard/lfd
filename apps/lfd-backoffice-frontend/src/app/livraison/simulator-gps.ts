/**
 * Les coordonnées GPS du simulateur, telles qu'on les colle depuis une carte
 * et telles qu'on les rend : sorties de `delivery-simulator.ts` pour que la
 * saisie, l'envoi et l'import lisent un point par la même règle.
 */

export interface GpsPoint {
  readonly lat: number;
  readonly lng: number;
}

export type GpsParse =
  { readonly ok: true; readonly gps: GpsPoint } | { readonly ok: false; readonly message: string };

const LAT_MAX = 90;
const LNG_MAX = 180;
const GPS_DECIMALS = 6;

/**
 * Lit des coordonnées collées depuis une carte : « 45.4485, 6.9823 » —
 * latitude PUIS longitude, séparées d'une virgule ou d'espaces. Une virgule
 * décimale à la française est refusée : « 45,4485, 6,9823 » est ambigu.
 */
export function parseGps(text: string): GpsParse {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Coordonnées requises, par exemple « 45.4485, 6.9823 ».' };
  }
  const parts = trimmed.split(/\s*,\s*|\s+/u);
  if (parts.length !== 2) {
    return {
      ok: false,
      message: 'Deux nombres attendus — latitude puis longitude, par exemple « 45.4485, 6.9823 ».',
    };
  }
  const [lat, lng] = parts.map((part) => (/^-?\d+(\.\d+)?$/u.test(part) ? Number(part) : NaN));
  if (lat === undefined || lng === undefined || Number.isNaN(lat) || Number.isNaN(lng)) {
    return {
      ok: false,
      message: 'Nombres illisibles : un point pour les décimales, par exemple « 45.4485, 6.9823 ».',
    };
  }
  if (Math.abs(lat) > LAT_MAX) {
    return {
      ok: false,
      message: 'Latitude hors bornes (entre -90 et 90) : l’ordre est latitude, longitude.',
    };
  }
  if (Math.abs(lng) > LNG_MAX) {
    return { ok: false, message: 'Longitude hors bornes (entre -180 et 180).' };
  }
  return { ok: true, gps: { lat, lng } };
}

/** Un point, tel qu'on le recolle : « 45.4485, 6.9823 ». */
export function gpsText(gps: GpsPoint): string {
  const round = (value: number): string => String(Number(value.toFixed(GPS_DECIMALS)));
  return `${round(gps.lat)}, ${round(gps.lng)}`;
}
