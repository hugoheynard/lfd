/** Exempter une société pour une clé. Acte **staff**, auteur figé. */
export class AddFeatureCompanyExemptionCommand {
  constructor(
    readonly key: string,
    readonly companyId: string,
    readonly staffUserId: string,
  ) {}
}
