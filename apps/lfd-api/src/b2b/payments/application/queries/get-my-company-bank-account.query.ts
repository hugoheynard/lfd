/** Le RIB de sa société, lu par un **client** — le demandeur décide du mur. */
export class GetMyCompanyBankAccountQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}
