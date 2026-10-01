/**
 * **« Autoriser le dépôt cette fois »** (`plan-a-la-porte.md`, B3, LB-Q5) —
 * la réponse d'un commercial sur un arrêt signalé. `staffUserId` : la fiche
 * de la requête, l'auteur tracé.
 */
export class AuthorizeStopDepositCommand {
  constructor(
    readonly staffUserId: string,
    readonly stopId: string,
  ) {}
}
