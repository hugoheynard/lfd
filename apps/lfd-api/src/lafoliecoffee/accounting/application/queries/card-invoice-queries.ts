/**
 * Les lectures de la facture carte (lots E5a, E5c) : les factures signalées,
 * et les pièces d'une commande.
 */

/** Les factures carte signalées — l'écran Comptabilité. */
export class GetCardInvoiceSignalsQuery {}

/** La facture et les avoirs d'une commande — la fiche commande du back-office. */
export class ListOrderInvoicesQuery {
  constructor(readonly orderId: string) {}
}
