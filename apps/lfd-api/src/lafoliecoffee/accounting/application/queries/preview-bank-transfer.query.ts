/**
 * **L'aperçu d'un virement reçu** avant de le saisir : les factures cochées et
 * le montant lu sur le relevé, chez une entité émettrice. Une lecture.
 */
export class PreviewBankTransferQuery {
  constructor(
    readonly legalEntityId: string,
    readonly amountCents: number,
    readonly invoiceIds: readonly string[],
  ) {}
}
