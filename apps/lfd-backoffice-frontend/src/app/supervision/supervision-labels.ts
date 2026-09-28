import { instantToLocal } from '@lfd/contracts';

/**
 * **Les mots de la Supervision.** Fonctions pures : l'écran les affiche, les
 * specs les lisent sans monter de composant.
 *
 * Vocabulaire du dépôt (§8) : le geste final est « retirée » ou « livrée »,
 * jamais « remise » — « remise » ne désigne que la réduction de prix.
 */

/**
 * `07:00` → « 7 h 00 » : l'heure d'une ligne de file, minutes toujours écrites
 * pour que la colonne des heures reste alignée. Mal formée : rendue telle quelle.
 */
export function slotTimeLabel(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  return match === null ? time : `${String(Number(match[1]))} h ${match[2] ?? '00'}`;
}

/**
 * L'heure d'un instant ISO **à Paris**, minutes toujours écrites : « 7 h 04 ».
 * `null` si l'instant est illisible — on n'écrit pas une heure inventée.
 */
export function clockLabel(iso: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  const [hours, minutes] = instantToLocal(instant).time.split(':');
  return `${String(Number(hours))} h ${minutes ?? '00'}`;
}

/** « à jour à 9 h 42 », à l'heure de Paris — `asOf` est l'horloge du serveur. */
export function asOfLabel(asOf: string): string {
  const clock = clockLabel(asOf);
  return clock === null ? '' : `à jour à ${clock}`;
}

/** « 1 commande », « 3 commandes » — le français ne met pas de « s » à un. */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

const MINUTES_PER_HOUR = 60;

/**
 * Une durée de retard, lisible d'un coup d'œil : « 40 min » sous l'heure,
 * « 1 h 05 » ou « 15 h » au-delà (Hugo, 2026-09-28 : « 900 min » ne se lisait
 * pas).
 */
export function durationLabel(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) {
    return `${String(minutes)} min`;
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest).padStart(2, '0')}`;
}
