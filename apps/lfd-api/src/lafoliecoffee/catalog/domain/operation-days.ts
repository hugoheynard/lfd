/** Une plage de jours de retrait `AAAA-MM-JJ`, bornes comprises. */
export interface PickupDayRange {
  readonly from: string;
  readonly until: string;
}

/**
 * **Le premier jour proposable** à un panier qui porte des articles
 * `operationOnly` (D6 : « un panier qui contient une bûche ne se voit proposer
 * que des jours de `[pickupFrom, pickupUntil]` »).
 *
 * Pure. `earliest` est le premier jour que les délais du commerce laissent ;
 * chaque entrée de `windows` est l'ensemble des plages d'UN article — il lui
 * suffit d'une (D3 : la galette, deux week-ends), mais tous les articles
 * doivent être servis le même jour, un panier ne se découpe pas.
 *
 * Un jour plus tardif que `earliest` ne peut pas tomber sous un délai : il ne
 * fait que s'en éloigner. Rendre le début de la plage est donc sûr.
 *
 * `null` = aucun jour commun — un article qu'aucune opération ouverte ne
 * propose, ou deux articles aux plages disjointes. `windows` vide = aucune
 * contrainte, `earliest` passe tel quel.
 */
export function firstPickupDay(
  earliest: string | null,
  windows: readonly (readonly PickupDayRange[])[],
): string | null {
  if (earliest === null || windows.length === 0) {
    return earliest;
  }
  const candidates = windows
    .flat()
    .map((range) => (range.from < earliest ? earliest : range.from))
    .concat(earliest)
    .sort();
  // Un jour commun, s'il existe, commence au début d'une plage (ou à
  // `earliest`) : il suffit d'éprouver ces débuts-là, dans l'ordre.
  for (const day of new Set(candidates)) {
    if (windows.every((ranges) => ranges.some((range) => within(day, range)))) {
      return day;
    }
  }
  return null;
}

function within(day: string, range: PickupDayRange): boolean {
  return range.from <= day && day <= range.until;
}
