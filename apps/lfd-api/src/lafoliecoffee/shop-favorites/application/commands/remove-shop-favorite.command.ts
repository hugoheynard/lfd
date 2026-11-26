/** Command **client** : retirer un article des favoris de l'espace courant. */
export class RemoveShopFavoriteCommand {
  constructor(
    readonly userId: string,
    /** La société de l'espace courant, ou `null` pour l'espace personnel. */
    readonly actingCompanyId: string | null,
    readonly sku: string,
  ) {}
}
