/** Ajoute un article reçu à la liste d'un site pour une journée. Acte staff. */
export class ReceiveResupplyLineCommand {
  constructor(
    readonly siteId: string,
    readonly serviceDay: string,
    readonly sku: string,
    readonly quantity: number,
    readonly staffUserId: string,
  ) {}
}
