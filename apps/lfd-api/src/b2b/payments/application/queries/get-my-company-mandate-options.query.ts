/** Les zones 14 et 19 du mandat de sa société, vues par le client (détenteur ou facturation). */
export class GetMyCompanyMandateOptionsQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}
