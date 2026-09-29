import type { GpsPoint } from '@lfd/contracts';

/** Le brouillon du point GPS : deux nombres, chacun encore vide possible. */
export interface GpsDraft {
  readonly lat: number | null;
  readonly lng: number | null;
}

export const EMPTY_GPS: GpsDraft = { lat: null, lng: null };

/** Les bornes du contrat (`gpsPointSchema`), en degrés décimaux. */
const LAT_LIMIT = 90;
const LNG_LIMIT = 180;

/** Le brouillon d'un point déjà enregistré — un absent se lit comme `null`. */
export function gpsDraftFrom(gps: GpsPoint | null | undefined): GpsDraft {
  return gps === null || gps === undefined ? EMPTY_GPS : { lat: gps.lat, lng: gps.lng };
}

/**
 * Ce qui empêche d'enregistrer le point GPS, avec la phrase à lire — ou `''`.
 *
 * Les deux vides est une réponse valable (le point n'a pas de GPS) ; un seul
 * rempli ne l'est pas : une latitude sans longitude ne désigne aucun lieu.
 */
export function gpsIssue(draft: GpsDraft): string {
  const { lat, lng } = draft;
  if (lat === null && lng === null) {
    return '';
  }
  if (lat === null || lng === null) {
    return 'Saisissez la latitude ET la longitude, ou laissez les deux vides.';
  }
  if (Math.abs(lat) > LAT_LIMIT) {
    return 'La latitude va de -90 à 90.';
  }
  if (Math.abs(lng) > LNG_LIMIT) {
    return 'La longitude va de -180 à 180.';
  }
  return '';
}

/** Le point à envoyer : `null` quand les deux sont vides, ce qui l'efface. */
export function toGps(draft: GpsDraft): GpsPoint | null {
  return draft.lat === null || draft.lng === null ? null : { lat: draft.lat, lng: draft.lng };
}
