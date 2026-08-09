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

/** Une ligne de la vue hebdomadaire : un jour et son créneau (ou aucun). */
export interface WeeklySlotRow {
  readonly short: string;
  readonly label: string;
  readonly slot: DeliverySlot | null;
}

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

/** Déplie les créneaux en sept lignes pour la visualisation. */
export function weeklySlots(slots: DeliverySlots): readonly WeeklySlotRow[] {
  return WEEKDAYS.map((day) => ({
    short: day.short,
    label: day.label,
    slot: slots.mode === 'everyday' ? slots.slot : slots.byDay[day.value],
  }));
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
