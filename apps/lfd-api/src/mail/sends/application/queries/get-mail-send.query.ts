/**
 * Query : **le détail d'un envoi** (plan `plan-suivi-des-e-mails.md`, T2) —
 * ses étapes, le genre du retour, la version du document, les tentatives ;
 * l'adresse masquée, sans la raison d'un échec.
 */
export class GetMailSendQuery {
  constructor(readonly sendId: string) {}
}
