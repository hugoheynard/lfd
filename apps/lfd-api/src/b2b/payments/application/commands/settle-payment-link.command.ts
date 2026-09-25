/**
 * Stripe a encaissé la session d'un lien libre — projection du webhook,
 * rapprochée par l'id de session (`cs_…`).
 */
export class SettlePaymentLinkCommand {
  constructor(readonly sessionId: string) {}
}
