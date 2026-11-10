/** Le mandat **courant** de sa société, vu par le client (détenteur ou facturation). */
export class GetMyCompanyMandateQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}
