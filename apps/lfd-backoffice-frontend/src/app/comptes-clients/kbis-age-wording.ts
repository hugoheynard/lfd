import type { KbisAge } from '@lfd/contracts';

/**
 * Ce que l'âge d'un extrait KBIS dit en clair, là où il s'affiche : la liste
 * des comptes et la fiche. Les seuils, eux, sont ceux de `kbisAgeOf`
 * (contrats) — ce fichier ne fait que les nommer.
 *
 * `null` pour un extrait récent : il n'y a rien à signaler.
 */
export function kbisAgeNote(age: KbisAge): string | null {
  switch (age) {
    case 'fresh':
      return null;
    case 'aging':
      return 'Extrait de plus de 3 mois';
    case 'stale':
      return 'Extrait de plus d’un an';
    case 'undated':
      return 'Date de délivrance inconnue';
  }
}

/** Le ton d'alerte d'un âge — `null` quand l'extrait est récent. */
export function kbisAgeTone(age: KbisAge): 'warning' | 'alert' | null {
  if (age === 'fresh') {
    return null;
  }
  return age === 'stale' ? 'alert' : 'warning';
}

/**
 * `2026-08-12` → `12/08/2026`. Découpé à la main : un jour calendaire n'a pas
 * de fuseau, et `new Date('2026-08-12')` le lirait à minuit UTC.
 */
export function frenchDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}
