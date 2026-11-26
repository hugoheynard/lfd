/** Command **client** : mettre un article en favori dans l'espace courant. */
export class AddShopFavoriteCommand {
  constructor(
    readonly userId: string,
    /** La société de l'espace courant, ou `null` pour l'espace personnel. */
    readonly actingCompanyId: string | null,
    readonly sku: string,
  ) {}
}
