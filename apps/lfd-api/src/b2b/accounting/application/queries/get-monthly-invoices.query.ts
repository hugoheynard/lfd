/** La facture du mois d'une entité, pour l'écran « Prélèvement du mois » (E4). */
export class GetMonthlyInvoicesQuery {
  constructor(readonly legalEntityId: string) {}
}
