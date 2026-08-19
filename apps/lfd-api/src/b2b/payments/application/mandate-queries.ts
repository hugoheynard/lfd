/** Le mandat **courant** d'une société — l'actif, ou le dernier connu. */
export class GetCompanyMandateQuery {
  constructor(readonly companyId: string) {}
}
