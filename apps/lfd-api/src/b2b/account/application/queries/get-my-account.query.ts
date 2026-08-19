/** Lit le compte de la personne connectée : son profil et ses entreprises. */
export class GetMyAccountQuery {
  constructor(readonly userId: string) {}
}
