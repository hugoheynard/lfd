/**
 * **La fenêtre d'acheminement telle qu'on la lit**, partout dans le
 * back-office : « 8 h 00 – 10 h 00 », ou « avant 10 h 00 » quand elle n'a pas
 * de début.
 *
 * Un seul formateur pour l'app (plan composition automatique, CA3) : une
 * échéance s'écrit « avant HH:MM » sur la feuille de route, au Coursier, dans
 * « Organisation de tournées », à la file du comptoir et sur la fiche de
 * commande. Chaque écran en avait son écriture, et une échéance s'y lisait
 * tantôt « 6 h 30 », tantôt « Avant 06:30 ».
 *
 * 🔴 Une borne basse absente ne s'invente pas : le contrat dit « avant `end` »,
 * pas « de minuit à `end` ».
 */

/** Les deux bornes d'une fenêtre — celles de tous les contrats qui en portent une. */
export interface WindowBounds {
  readonly start: string | null;
  readonly end: string;
}

/** « 8 h 30 » à partir de « 08:30 » ; une valeur illisible est rendue telle quelle. */
export function timeLabel(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  return match === null ? time : `${String(Number(match[1]))} h ${match[2] ?? '00'}`;
}

/** « 8 h 00 – 10 h 00 », ou « avant 10 h 00 » sans début. */
export function fulfillmentWindowLabel(window: WindowBounds): string {
  return window.start === null
    ? `avant ${timeLabel(window.end)}`
    : `${timeLabel(window.start)} – ${timeLabel(window.end)}`;
}
