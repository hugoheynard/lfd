/** Stripe a laissé mourir la session d'un lien libre (`checkout.session.expired`). */
export class ExpirePaymentLinkCommand {
  constructor(readonly sessionId: string) {}
}
