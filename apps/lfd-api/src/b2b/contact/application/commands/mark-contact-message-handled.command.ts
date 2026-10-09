/** Marquer un message traité. Acte **staff** : l'auteur est figé avec son nom. */
export class MarkContactMessageHandledCommand {
  constructor(
    readonly messageId: string,
    readonly staffUserId: string,
  ) {}
}
