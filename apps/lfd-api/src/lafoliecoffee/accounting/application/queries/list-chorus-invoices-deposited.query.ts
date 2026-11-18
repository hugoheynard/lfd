/** « Déposées » : celles qui ont un dépôt noté, leur échéance effective, leur rejet ou leur mise en paiement. Filtre : l'entité, ou `null`. */
export class ListChorusInvoicesDepositedQuery {
  constructor(readonly legalEntityId: string | null) {}
}
