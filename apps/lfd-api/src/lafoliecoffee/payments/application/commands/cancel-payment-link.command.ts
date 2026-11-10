/** Retirer un lien libre encore ouvert. `staffUserId` vient de la porte staff. */
export class CancelPaymentLinkCommand {
  constructor(
    readonly paymentLinkId: string,
    readonly staffUserId: string,
  ) {}
}
