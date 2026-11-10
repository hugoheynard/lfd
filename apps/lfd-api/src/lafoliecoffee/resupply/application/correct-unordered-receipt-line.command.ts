/** Corrige la quantité reçue d'un article de la liste. Acte staff. */
export class CorrectUnorderedReceiptLineCommand {
  constructor(
    readonly siteId: string,
    readonly serviceDay: string,
    readonly sku: string,
    readonly quantity: number,
    readonly staffUserId: string,
  ) {}
}
