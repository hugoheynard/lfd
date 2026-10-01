/**
 * **« Rapporter »** (`plan-a-la-porte.md`, B3, LB-Q2) — la réponse d'un
 * commercial sur un arrêt signalé : l'arrêt se clôt « rapporté ».
 * `staffUserId` : la fiche de la requête, l'auteur tracé.
 */
export class BringStopBackCommand {
  constructor(
    readonly staffUserId: string,
    readonly stopId: string,
  ) {}
}
