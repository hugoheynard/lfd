import type { DeliverySlot, SlotByDay, Weekday } from '@lfd/contracts';

/** Brouillon de créneau par jour côté formulaire (chaînes, `''` = vide). */
export type DraftDay = { readonly start: string; readonly end: string };
export type DraftDays = Readonly<Record<Weekday, DraftDay>>;

const BLANK_DAY: DraftDay = { start: '', end: '' };

/** Sept jours vierges. */
export const BLANK_DAYS: DraftDays = {
  mon: BLANK_DAY,
  tue: BLANK_DAY,
  wed: BLANK_DAY,
  thu: BLANK_DAY,
  fri: BLANK_DAY,
  sat: BLANK_DAY,
  sun: BLANK_DAY,
};

/** Vrai créneau : début et fin renseignés, fin après le début. Sinon `null`. */
export function toSlot(start: string, end: string): DeliverySlot | null {
  return start !== '' && end !== '' && start < end ? { start, end } : null;
}

/** Un créneau *invalide* : entamé mais incomplet, ou fin ≤ début. */
export function isBadSlot(start: string, end: string): boolean {
  const touched = start !== '' || end !== '';
  return touched && !(start !== '' && end !== '' && start < end);
}

/** Message d'erreur GPS (`''` si valide) : deux coordonnées, ou aucune, en bornes. */
export function gpsIssueOf(lat: string, lng: string): string {
  if (lat === '' && lng === '') {
    return '';
  }
  if (lat === '' || lng === '') {
    return 'Renseignez la latitude ET la longitude, ou laissez les deux vides.';
  }
  const nlat = Number(lat);
  const nlng = Number(lng);
  const inRange =
    Number.isFinite(nlat) && Number.isFinite(nlng) && Math.abs(nlat) <= 90 && Math.abs(nlng) <= 180;
  return inRange ? '' : 'Coordonnées hors limites (latitude ±90, longitude ±180).';
}

/** Projette les créneaux stockés vers les brouillons de formulaire. */
export function fromSlotByDay(byDay: SlotByDay): DraftDays {
  const draft = (slot: DeliverySlot | null): DraftDay =>
    slot ? { start: slot.start, end: slot.end } : BLANK_DAY;
  return {
    mon: draft(byDay.mon),
    tue: draft(byDay.tue),
    wed: draft(byDay.wed),
    thu: draft(byDay.thu),
    fri: draft(byDay.fri),
    sat: draft(byDay.sat),
    sun: draft(byDay.sun),
  };
}
