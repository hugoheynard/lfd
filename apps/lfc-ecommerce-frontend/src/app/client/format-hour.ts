/**
 * **Les heures telles qu'on les lit**, à partir du `HH:MM` du serveur.
 *
 * Elles étaient écrites à la main dans la maquette (`'7 h – 8 h'`), ce qui a
 * duré tant que la grille était fixe. Elle ne l'est plus : elle se déduit des
 * heures déclarées du point de retrait, donc les libellés se fabriquent.
 *
 * Écriture française : espace insécable avant le `h`, minutes seulement quand il
 * y en a — « 7 h », « 6 h 30 ». Une heure ronde affichée « 7 h 00 » se lit comme
 * une horloge de gare, pas comme une boulangerie.
 */

/** L'espace insécable qui colle le nombre à son `h`. */
const NBSP = ' ';

/** `07:00` → `7 h` ; `06:30` → `6 h 30`. */
export function formatHour(time: string): string {
  const [hours = '', minutes = ''] = time.split(':');
  const hour = `${Number(hours)}${NBSP}h`;
  return minutes === '00' ? hour : `${hour}${NBSP}${minutes}`;
}

/**
 * `07:00`→`08:00` = « 7 h – 8 h ». Une borne basse absente donne « avant 8 h » :
 * le point n'a pas déclaré son ouverture, et inventer « 0 h – 8 h » ouvrirait la
 * nuit.
 */
export function formatWindow(start: string | null, end: string, before: string): string {
  return start === null
    ? `${before} ${formatHour(end)}`
    : `${formatHour(start)}${NBSP}– ${formatHour(end)}`;
}
