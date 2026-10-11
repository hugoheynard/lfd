import { addDays, instantToLocal, localToInstant } from '@lfd/contracts';

/**
 * Les journées de l'aperçu se disent RELATIVEMENT à aujourd'hui : un créneau
 * écrit pour « le 15 » ne s'afficherait plus le 16. Les conversions sont
 * celles du contrat, à l'heure de Paris, comme le serveur les fait.
 */

/** La journée locale (`AAAA-MM-JJ`) qui suit aujourd'hui de `offset` jours. */
export function demoDay(offset: number, now: Date = new Date()): string {
  return addDays(instantToLocal(now).day, offset);
}

/** L'instant UTC (ISO) d'une heure locale de la boutique ; `null` si elle n'existe pas ce jour-là. */
export function demoInstant(day: string, time: string): string | null {
  return localToInstant(day, time)?.toISOString() ?? null;
}
