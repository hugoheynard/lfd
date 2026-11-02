import { shiftDay } from './previsionnel-range';

/**
 * **Le nom d'un plan, par ce qu'il sert** (Hugo, 2026-11-02).
 *
 * « Le plan du lun. 2 nov. » se lisait aussi bien « fait lundi » que « pour
 * lundi » : un matin à 7 h, le bandeau du rattrapage a fait croire qu'on allait
 * arrêter la production de mardi. Un plan porte le jour de REMISE de ses
 * commandes, et le fournil le cuit ce matin-là : on le nomme donc par sa
 * fournée — « la fournée de ce matin », « la fournée de demain » — et on dit le
 * jour des commandes à côté.
 */
export function batchName(date: string, today: string): string {
  if (date === today) {
    return 'la fournée de ce matin';
  }
  if (date === shiftDay(today, 1)) {
    return 'la fournée de demain';
  }
  return 'la fournée';
}

/** « la fournée de demain (commandes du mar. 3 nov.) ». */
export function batchWithOrders(
  date: string,
  today: string,
  day: { readonly weekday: string; readonly dayMonth: string },
): string {
  return `${batchName(date, today)} (commandes du ${day.weekday} ${day.dayMonth})`;
}

/** La même, avec sa majuscule, en tête de phrase ou de bouton. */
export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
