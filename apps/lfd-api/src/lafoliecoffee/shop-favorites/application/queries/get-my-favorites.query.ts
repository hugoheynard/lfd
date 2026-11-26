/** Query **client** : les favoris de l'espace courant. */
export class GetMyFavoritesQuery {
  constructor(
    readonly userId: string,
    /** La société de l'espace courant, ou `null` pour l'espace personnel. */
    readonly actingCompanyId: string | null,
  ) {}
}
