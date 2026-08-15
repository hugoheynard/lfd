/**
 * Des **plages horaires nommées**, et rien d'autre.
 *
 * Candidate à `fold-ng`, comme le socle adresse : ce fichier ne connaît ni
 * retrait, ni livraison, ni jour de la semaine. Il connaît « un nom, une heure
 * de début, une heure de fin » — et c'est la même chose qu'on écrit pour un
 * créneau pro, une ouverture au public ou un mardi.
 *
 * Tout est chaîne (`''` = vide) : une plage à moitié saisie n'est pas une
 * erreur de type, c'est l'état normal d'un formulaire en cours.
 */
export interface TimeRange {
  readonly start: string;
  readonly end: string;
}

/** Une plage et son nom. La `key` identifie la ligne, le `label` la nomme. */
export interface HoursEntry {
  readonly key: string;
  readonly label: string;
  readonly range: TimeRange;
}

export const EMPTY_TIME_RANGE: TimeRange = { start: '', end: '' };

/** Une plage complète et cohérente : deux bornes, la fin après le début. */
export function isRangeSet(range: TimeRange): boolean {
  return range.start !== '' && range.end !== '' && range.start < range.end;
}

/** Une plage **entamée mais fausse** : une seule borne, ou fin ≤ début. */
export function isBadRange(range: TimeRange): boolean {
  const touched = range.start !== '' || range.end !== '';
  return touched && !isRangeSet(range);
}

/**
 * La plage, lisible. Une borne manquante ne rend pas la phrase muette : « à
 * partir de 9:00 » et « jusqu'à 12:00 » se disent, et se lisent mieux qu'un
 * tiret suspendu.
 */
export function formatTimeRange(range: TimeRange): string {
  if (range.start !== '' && range.end !== '') {
    return `${range.start}–${range.end}`;
  }
  if (range.start !== '') {
    return `à partir de ${range.start}`;
  }
  return range.end === '' ? '' : `jusqu'à ${range.end}`;
}

/** Les plages réellement déclarées — celles qui disent quelque chose. */
export function declaredHours(entries: readonly HoursEntry[]): readonly HoursEntry[] {
  return entries.filter((entry) => formatTimeRange(entry.range) !== '');
}

/** Message d'erreur des plages (`''` si toutes valides ou vides). */
export function hoursIssueOf(entries: readonly HoursEntry[]): string {
  return entries.some((entry) => isBadRange(entry.range))
    ? 'Renseignez une heure de début ET de fin, la fin après le début.'
    : '';
}

/** Écrit une borne d'une ligne, immuablement. Une clé inconnue ne fait rien. */
export function withRangePart(
  entries: readonly HoursEntry[],
  key: string,
  part: 'start' | 'end',
  value: string,
): readonly HoursEntry[] {
  return entries.map((entry) =>
    entry.key === key ? { ...entry, range: { ...entry.range, [part]: value } } : entry,
  );
}
