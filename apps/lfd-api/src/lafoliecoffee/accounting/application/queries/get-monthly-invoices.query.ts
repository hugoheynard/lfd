/** La facture de la dernière clôture d'une entité, pour l'écran « Prélèvement du mois » (E4, R3). */
export class GetMonthlyInvoicesQuery {
  constructor(readonly legalEntityId: string) {}
}
