/** Query : **les lignes trouvées par une recherche du registre**, à son seul auteur, 5 minutes. */
export class GetMarketingPreferenceSearchQuery {
  constructor(
    readonly searchId: string,
    readonly staffUserId: string,
  ) {}
}
