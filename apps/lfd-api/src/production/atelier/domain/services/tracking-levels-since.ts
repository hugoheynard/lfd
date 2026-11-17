/**
 * **La mise en service des niveaux de suivi** (plan
 * `documentation/fournil/plan-niveaux-de-suivi.md`, § 3.1) : une journée
 * arrêtée avant cet instant reste en détaillé et n'est jamais figée — le
 * fournil l'a suivie fournée par fournée, et toujours vert n'y a pas sa place.
 *
 * 🔴 **À poser au déploiement** qui met la page « Niveau de suivi » en ligne
 * (lot N4, avant le cron N3) : l'instant de la mise en service, en heure de
 * Paris. D'ici là, une date future, pour qu'aucune journée ne soit figée en
 * toujours vert avant que l'équipe puisse choisir son niveau.
 */
export const TRACKING_LEVELS_SINCE = new Date("2027-01-01T00:00:00+01:00");
