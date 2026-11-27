/** Retire un article de la liste d'envies de la personne, dans la société de l'espace. */
export class RemoveWishlistItemCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string | null,
    readonly sku: string,
  ) {}
}
