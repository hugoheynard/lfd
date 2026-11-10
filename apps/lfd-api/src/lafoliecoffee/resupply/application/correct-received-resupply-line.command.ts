/** Corrige le reçu d'un article d'un réassort réceptionné — un écart. Acte staff. */
export class CorrectReceivedResupplyLineCommand {
  constructor(
    readonly siteId: string,
    readonly resupplyId: string,
    readonly sku: string,
    readonly quantity: number,
    readonly staffUserId: string,
  ) {}
}
