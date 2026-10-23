/**
 * Abandonne un export des mandats que la banque a rejeté (plan
 * `plan-page-procedure-de-prelevement.md` § 7, S3) : il cesse d'être « en
 * attente », et ses mandats restent « à exporter ».
 */
export class AbandonMandateBankExportCommand {
  constructor(
    readonly legalEntityId: string,
    readonly exportId: string,
    readonly staffUserId: string,
  ) {}
}
