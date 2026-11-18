/** « À déposer » : factures (380) d'un organisme public sans ligne de dépôt, non annulées par un avoir — les plus anciennes d'abord. Filtre : l'entité, ou `null`. */
export class ListChorusInvoicesToDepositQuery {
  constructor(readonly legalEntityId: string | null) {}
}
