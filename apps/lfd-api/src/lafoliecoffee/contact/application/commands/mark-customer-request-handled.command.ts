/** Marquer une demande traitée. Acte **staff** : l'auteur est figé avec son nom. */
export class MarkCustomerRequestHandledCommand {
  constructor(
    readonly requestId: string,
    readonly staffUserId: string,
  ) {}
}
