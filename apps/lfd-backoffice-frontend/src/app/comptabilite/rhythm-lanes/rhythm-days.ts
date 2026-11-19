/**
 * L'arithmétique de jours de la frise des rythmes — des `AAAA-MM-JJ` et des
 * `AAAA-MM`, sans fuseau : elle POSE des dates servies, elle n'en calcule
 * aucune.
 */

const MS_PER_DAY = 86_400_000;
const MONTHS_PER_YEAR = 12;

function utcOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1);
}

/** Jours de calendrier entre deux `AAAA-MM-JJ`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / MS_PER_DAY);
}

export function addDays(day: string, days: number): string {
  return new Date(utcOf(day) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** « 16 nov. » — la graduation. */
export function shortDay(day: string): string {
  return new Date(utcOf(day)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** « 16 novembre 2026 » — ce qu'on lit et ce qu'on entend. */
export function longDay(day: string): string {
  return new Date(utcOf(day)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** « Novembre 2026 » — le titre de l'axe. */
export function monthTitle(month: string): string {
  const text = new Date(utcOf(`${month}-01`)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Le mois `AAAA-MM` décalé de `delta` mois — la flèche précédente ou suivante. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthOfYear] = month.split('-').map(Number);
  const index = (year ?? 0) * MONTHS_PER_YEAR + (monthOfYear ?? 1) - 1 + delta;
  const shiftedYear = Math.floor(index / MONTHS_PER_YEAR);
  const shiftedMonth = (index % MONTHS_PER_YEAR) + 1;
  return `${String(shiftedYear)}-${String(shiftedMonth).padStart(2, '0')}`;
}
