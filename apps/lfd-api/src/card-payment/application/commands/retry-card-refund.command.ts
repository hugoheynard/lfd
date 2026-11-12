/**
 * **« Relancer »** une demande de remboursement (plan M2, §3.4, §5.3) — la
 * route d'équipe `POST admin/card-payments/refund-requests/:requestId/retry`.
 */
export class RetryCardRefundCommand {
  constructor(
    readonly requestId: string,
    /** La fiche staff de qui relance — l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un second envoi ne relance rien de plus. */
    readonly intentKey: string,
  ) {}
}
