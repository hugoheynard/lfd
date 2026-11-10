/**
 * Fait en mémoire : **un remboursement réussi reste sans avoir automatique**
 * (lot E5b) — la commande est sur une facture du mois, ou le montant dépasse
 * ce que sa facture carte porte encore. Il ne sert qu'à sonner la cloche ; la
 * trace opposable est au journal (`order.refund_not_credited`), écrite dans
 * la transaction.
 */
export class RefundNotCreditedEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    /** L'id de la ligne `order_refund` — la clé de la cloche. */
    readonly refundId: string,
    readonly amountCents: number,
    readonly invoiceNumber: string,
    readonly reason: "account_invoice" | "exceeds_invoice",
  ) {}
}
