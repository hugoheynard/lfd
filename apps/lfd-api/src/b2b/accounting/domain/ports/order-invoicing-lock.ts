/**
 * **Le verrou de la commande** pour sa facture et ses avoirs (lots E5a, E5b) :
 * le retrait et l'encaissement peuvent arriver ensemble, et deux
 * remboursements aussi. Sous ce verrou, « déjà facturée ? » et « déjà
 * avoirisé ? » se lisent sans qu'un concurrent émette entre la lecture et
 * l'écriture ; l'unicité `invoice_order` reste le filet, jamais le chemin.
 *
 * Tenu jusqu'à la fin de la transaction : à appeler sous `UnitOfWork.run`.
 */
export abstract class OrderInvoicingLock {
  abstract lock(orderId: string): Promise<void>;
}
