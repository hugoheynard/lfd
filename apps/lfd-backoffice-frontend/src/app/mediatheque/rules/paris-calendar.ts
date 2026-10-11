/**
 * **Le calendrier de la médiathèque** — les jours et les instants dits à
 * l'heure de PARIS, le fuseau de la boulangerie, jamais celui du navigateur.
 *
 * Deux sortes de dates traversent l'écran, et elles ne se lisent pas pareil :
 *
 * - un **instant** (`depositedAt`, les bornes d'une colonne de la frise) : un
 *   point du temps, qu'on ramène au jour de Paris où il tombe ;
 * - un **jour civil** (`shotOn`, `shotFrom`) : `2026-03-01` est le 1er mars
 *   partout. Le passer tel quel à `new Date()` le lirait à minuit UTC, et un
 *   poste réglé à l'ouest le dirait le 28 février.
 *
 * Aucune fonction ne lit l'horloge : qui veut « aujourd'hui » passe l'instant.
 */

const PARIS = 'Europe/Paris';

/** `en-CA` : la seule locale dont la forme courte est `AAAA-MM-JJ`. */
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARIS,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const PARIS_DAY_LABEL = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const PARIS_MOMENT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Un jour civil se lit en UTC : c'est ainsi qu'il est construit ({@link civilDate}). */
const CIVIL_DAY_LABEL = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const CIVIL_MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

const CIVIL_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Le jour de Paris où tombe un instant, `AAAA-MM-JJ`. */
export function parisDay(at: Date): string {
  return PARIS_DAY.format(at);
}

/** Le jour de Paris d'un instant ISO, `AAAA-MM-JJ`. */
export function parisDayOf(iso: string): string {
  return parisDay(new Date(iso));
}

/** « 3 octobre 2026 » — le jour de Paris d'un instant ISO, en toutes lettres. */
export function parisDayLabel(iso: string): string {
  return PARIS_DAY_LABEL.format(new Date(iso));
}

/** « 3 octobre 2026 à 14:05 » — un instant ISO, à l'heure de Paris. */
export function parisMomentLabel(iso: string): string {
  return PARIS_MOMENT.format(new Date(iso));
}

/** Un jour civil `AAAA-MM-JJ` comme date UTC de minuit ; `null` s'il est mal formé. */
function civilDate(day: string): Date | null {
  const match = CIVIL_DAY.exec(day);
  if (match === null) {
    return null;
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** « 12 mars 2026 » — un jour civil en toutes lettres. `null` : mal formé. */
export function civilDayLabel(day: string): string | null {
  const date = civilDate(day);
  return date === null ? null : CIVIL_DAY_LABEL.format(date);
}

/** « mars 2026 » — le mois d'un jour civil. `null` : mal formé. */
export function civilMonthLabel(day: string): string | null {
  const date = civilDate(day);
  return date === null ? null : CIVIL_MONTH_LABEL.format(date);
}
