/** Ajoute un article à la liste d'envies de la personne, dans la société de l'espace. */
export class AddWishlistItemCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string | null,
    readonly sku: string,
  ) {}
}
