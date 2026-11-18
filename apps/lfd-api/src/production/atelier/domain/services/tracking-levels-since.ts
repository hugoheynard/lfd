/**
 * **La mise en service des niveaux de suivi**
 * (`documentation/fournil/les-niveaux-de-suivi.md`) : une journée
 * arrêtée avant cet instant reste en détaillé et n'est jamais figée — le
 * fournil l'a suivie fournée par fournée, et toujours vert n'y a pas sa place.
 *
 * Mise en service décidée par Hugo le 2026-11-18 : la journée du jour, arrêtée
 * la veille, reste en détaillé ; la première journée arrêtée depuis suit le
 * niveau réglé.
 */
export const TRACKING_LEVELS_SINCE = new Date("2026-11-18T00:00:00+01:00");
