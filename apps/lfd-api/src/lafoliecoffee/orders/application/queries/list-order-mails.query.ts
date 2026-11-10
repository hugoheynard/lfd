/** Les e-mails demandés pour une commande — la fiche commande du back-office. */
export class ListOrderMailsQuery {
  constructor(readonly orderId: string) {}
}
