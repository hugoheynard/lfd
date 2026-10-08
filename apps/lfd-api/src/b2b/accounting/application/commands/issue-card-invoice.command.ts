/**
 * **Émettre la facture carte d'une commande**, si elle est due (lot E5a) :
 * pro, encaissée par carte, retirée, pas encore facturée. Sans effet sinon.
 * Envoyée par les deux abonnés (retrait, encaissement) et par « Réessayer ».
 */
export class IssueCardInvoiceCommand {
  constructor(readonly orderId: string) {}
}
