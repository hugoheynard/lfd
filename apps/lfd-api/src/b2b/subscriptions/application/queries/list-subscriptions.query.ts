/** Liste les paniers récurrents de la personne connectée (mur = son userId). */
export class ListSubscriptionsQuery {
  constructor(readonly actorUserId: string) {}
}
