/** Retire un article de la liste reçue (saisi par erreur). Acte staff. */
export class WithdrawUnorderedReceiptLineCommand {
  constructor(
    readonly siteId: string,
    readonly serviceDay: string,
    readonly sku: string,
    readonly staffUserId: string,
  ) {}
}
