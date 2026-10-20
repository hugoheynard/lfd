/** Requête **staff** : le tableau action × rôle des avis d'un principal. */
export class GetSubAccountNoticeRulesQuery {
  constructor(readonly principalId: string) {}
}
