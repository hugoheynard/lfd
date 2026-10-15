/** Les CGV qu'une commande porte — le détail de commande du back-office. */
export class GetOrderSalesTermsQuery {
  constructor(readonly orderId: string) {}
}
