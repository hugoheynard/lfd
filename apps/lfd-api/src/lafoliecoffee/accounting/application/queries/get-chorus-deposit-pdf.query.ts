/** Le PDF ordinaire d'une facture publique, à déposer à la main sur Chorus Pro. */
export class GetChorusDepositPdfQuery {
  constructor(readonly invoiceId: string) {}
}
