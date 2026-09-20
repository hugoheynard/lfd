import type { ProductionWorksheetView } from '@lfd/contracts';

/**
 * Les petites conversions des postes du fournil : un jour, une heure, et le mot
 * qui dit où tombe la journée servie.
 *
 * Hors du composant parce qu'aucune ne dépend de l'écran : ce sont des fonctions
 * pures, elles s'éprouvent sans monter quoi que ce soit, et la page reste sous
 * les 300 lignes que le dépôt s'impose.
 */

/**
 * « aujourd'hui » / « demain » — une correspondance de MOTS, et rien d'autre.
 *
 * L'écran ne compare pas de dates : c'est le serveur qui dit où tombe la journée
 * lue (`relativeDay`), selon SON horloge. Celle d'un poste de fournil n'est pas
 * une autorité, et se tromper d'un jour est l'erreur la plus chère du poste.
 * Partagé par la fiche d'atelier et le colisage depuis le 2026-09-14.
 */
export const RELATIVE_DAY_LABEL: Readonly<
  Record<NonNullable<ProductionWorksheetView['relativeDay']>, string>
> = {
  today: 'aujourd’hui',
  tomorrow: 'demain',
};

const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** `AAAA-MM-JJ` d'un instant, en heure **locale** — le jour tel que l'équipe le dit. */
export function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** « samedi 16 août » — l'en-tête de la fiche. */
export function dayLabelOf(isoDate: string): string {
  return DAY_LABEL.format(new Date(`${isoDate}T00:00:00`));
}

/**
 * « 4 h 05 » — l'heure d'un instant ISO, telle que le fournil la dit.
 *
 * Écrite à la main plutôt que par `Intl` : `fr-FR` rend « 04:05 », qui est
 * l'heure d'un horaire de train, pas celle d'un tirage.
 */
export function hourLabel(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return null;
  }
  return `${at.getHours()} h ${`${at.getMinutes()}`.padStart(2, '0')}`;
}

/** La clé d'une coche en vol : une ligne d'une journée, et rien de plus fin. */
export function markKey(date: string, sku: string): string {
  return `${date} ${sku}`;
}

/**
 * Le lendemain d'un instant.
 *
 * Par `setDate`, qui absorbe les fins de mois, les années bissextiles et les
 * changements d'heure — un `+ 86_400_000` se trompe deux fois par an, et
 * toujours la nuit, c'est-à-dire pendant la fournée.
 */
export function nextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}
