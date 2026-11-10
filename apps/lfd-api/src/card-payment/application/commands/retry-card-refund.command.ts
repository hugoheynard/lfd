/**
 * **« Relancer »** une demande de remboursement (plan M2, §3.4, §5.3) — la
 * route d'équipe `POST admin/card-payments/refund-requests/:requestId/retry`.
 */
export class RetryCardRefundCommand {
  constructor(readonly requestId: string) {}
}
