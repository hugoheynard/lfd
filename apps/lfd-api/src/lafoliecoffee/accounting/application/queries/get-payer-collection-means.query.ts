/** Le moyen d'encaissement d'un compte sous une entité (V1). */
export class GetPayerCollectionMeansQuery {
  constructor(
    readonly legalEntityId: string,
    readonly companyId: string,
  ) {}
}
