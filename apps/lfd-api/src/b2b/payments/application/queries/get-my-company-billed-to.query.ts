/** À qui sa société est facturée, lu par un **client** — le demandeur décide du mur. */
export class GetMyCompanyBilledToQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}
