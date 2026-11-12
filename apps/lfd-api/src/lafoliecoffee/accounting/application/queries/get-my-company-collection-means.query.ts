/**
 * Le moyen d'encaissement du compte, lu par le client dans son espace : sous
 * le mur (membre de la société), sans IBAN.
 */
export class GetMyCompanyCollectionMeansQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
  ) {}
}
