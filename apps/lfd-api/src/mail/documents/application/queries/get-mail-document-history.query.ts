/** Query : l'historique des versions publiées du document d'un e-mail. */
export class GetMailDocumentHistoryQuery {
  constructor(readonly template: string) {}
}
