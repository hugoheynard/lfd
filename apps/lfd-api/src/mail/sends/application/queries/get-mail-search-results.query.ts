/**
 * Query : **les envois trouvés par une recherche** (décision 8) — masqués,
 * à son seul auteur, dans les 5 minutes. Ne trace rien : la trace est celle
 * de la recherche.
 */
export class GetMailSearchResultsQuery {
  constructor(
    readonly searchId: string,
    readonly staffUserId: string,
  ) {}
}
