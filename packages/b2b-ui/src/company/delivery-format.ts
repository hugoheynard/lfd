import { slotsFor } from '@lfd/contracts';
import type {
  DeliveryContact,
  DeliverySlot,
  DeliverySpecs,
  GpsPoint,
  PreferredDeadlines,
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

/**
 * Rend un créneau lisible : `08:00–10:00`. Un créneau a toujours un début ;
 * une échéance a sa propre liste (`deadlines`) et son écriture, ci-dessous.
 */
export function formatSlot(slot: DeliverySlot): string {
  return `${slot.start}–${slot.end}`;
}

/** Une échéance lisible : `avant 06:00`. `before` = le mot de la langue d'affichage. */
export function formatDeadline(time: string, before = 'avant'): string {
  return `${before} ${time}`;
}

/** Une ligne nommée — « Tous les jours », ou un jour de la semaine — et ses heures. */
export interface WindowRow {
  readonly key: string;
  readonly label: string;
  /** `avant 06:00 · avant 11:00`, `07:00–08:00 · 18:00–19:00`, ou `''` quand ce jour n'a rien. */
  readonly text: string;
}

/** Une ligne d'échéances. */
export type DeadlineRow = WindowRow;

/**
 * Les échéances préférées d'une adresse, en lignes à afficher. Les jours sans
 * échéance restent dans la liste, comme les créneaux : « mardi, rien » est
 * justement l'information.
 */
export function deadlineRows(
  deadlines: PreferredDeadlines | null | undefined,
): readonly DeadlineRow[] {
  const text = (times: readonly string[] | null): string =>
    (times ?? []).map((time) => formatDeadline(time)).join(' · ');
  if (deadlines === null || deadlines === undefined) {
    return [];
  }
  if (deadlines.mode === 'everyday') {
    return [{ key: 'every', label: 'Tous les jours', text: text(deadlines.times) }];
  }
  return WEEKDAYS.map((day) => ({
    key: day.value,
    label: day.label,
    text: text(deadlines.byDay[day.value]),
  }));
}

/** Une adresse en mode échéance est commandable dès qu'elle en porte au moins une. */
export function hasPreferredDeadline(deadlines: PreferredDeadlines | null | undefined): boolean {
  return deadlineRows(deadlines).some((row) => row.text !== '');
}

/**
 * Les créneaux préférés d'une adresse, en lignes à afficher (CA3b) — plusieurs
 * par ligne, lus par `slotsFor`. Les jours sans créneau restent dans la liste :
 * « mardi, rien » est justement l'information.
 */
export function slotRows(specs: Pick<DeliverySpecs, 'slots' | 'slotList'>): readonly WindowRow[] {
  const text = (slots: readonly DeliverySlot[]): string => slots.map(formatSlot).join(' · ');
  const mode = specs.slotList?.mode ?? specs.slots.mode;
  if (mode === 'everyday') {
    return [{ key: 'every', label: 'Tous les jours', text: text(slotsFor(specs, null)) }];
  }
  return WEEKDAYS.map((day) => ({
    key: day.value,
    label: day.label,
    text: text(slotsFor(specs, day.value)),
  }));
}

/** Une adresse en mode créneau est commandable dès qu'elle en porte au moins un, un jour. */
export function hasPreferredSlot(specs: Pick<DeliverySpecs, 'slots' | 'slotList'>): boolean {
  return slotRows(specs).some((row) => row.text !== '');
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
