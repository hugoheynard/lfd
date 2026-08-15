import type { HoursEntry } from '../hours/hours.model';
import type {
  DeliveryContact,
  DeliverySlot,
  DeliverySlots,
  GpsPoint,
  Weekday,
} from '@lfd/contracts';

/**
 * Formatage d'affichage des consignes de livraison, sur les types **de fil**
 * (`@lfd/contracts`). Pur, sans état — la carte adresses et le panneau d'édition
 * s'en servent pour rendre créneaux / contact / GPS lisibles.
 */

/** Jours ouvrés dans l'ordre d'affichage, avec libellés long et court. */
export const WEEKDAYS: readonly {
  readonly value: Weekday;
  readonly label: string;
  readonly short: string;
}[] = [
  { value: 'mon', label: 'Lundi', short: 'Lun' },
  { value: 'tue', label: 'Mardi', short: 'Mar' },
  { value: 'wed', label: 'Mercredi', short: 'Mer' },
  { value: 'thu', label: 'Jeudi', short: 'Jeu' },
  { value: 'fri', label: 'Vendredi', short: 'Ven' },
  { value: 'sat', label: 'Samedi', short: 'Sam' },
  { value: 'sun', label: 'Dimanche', short: 'Dim' },
];

/** Rend un créneau lisible : `08:00–10:00`. */
export function formatSlot(slot: DeliverySlot): string {
  return `${slot.start}–${slot.end}`;
}

/**
 * Une adresse est **commandable** dès qu'elle porte au moins un créneau : le
 * créneau global (`everyday`) ou un jour renseigné (`perDay`).
 */
export function hasDeliverySlot(slots: DeliverySlots): boolean {
  if (slots.mode === 'everyday') {
    return slots.slot !== null;
  }
  return WEEKDAYS.some((day) => slots.byDay[day.value] !== null);
}

/**
 * Déplie les créneaux en sept plages nommées, pour le socle `lfd-hours`. Les
 * jours sans créneau restent dans la liste : c'est l'affichage qui décide de
 * les montrer en creux ou de les taire.
 */
export function weeklySlots(slots: DeliverySlots): readonly HoursEntry[] {
  return WEEKDAYS.map((day) => {
    const slot = slots.mode === 'everyday' ? slots.slot : slots.byDay[day.value];
    return {
      key: day.value,
      label: day.label,
      range: { start: slot?.start ?? '', end: slot?.end ?? '' },
    };
  });
}

/** Nom complet d'un contact de livraison, espaces superflus retirés. */
export function formatDeliveryContact(contact: DeliveryContact): string {
  return `${contact.prenom} ${contact.nom}`.trim();
}

/** Point GPS lisible : `48.8566, 2.3522`. */
export function formatGps(gps: GpsPoint): string {
  return `${gps.lat}, ${gps.lng}`;
}

/** Lien vers une carte externe centrée sur le point (nouvel onglet). */
export function gpsMapUrl(gps: GpsPoint): string {
  return `https://www.openstreetmap.org/?mlat=${gps.lat}&mlon=${gps.lng}#map=18/${gps.lat}/${gps.lng}`;
}
