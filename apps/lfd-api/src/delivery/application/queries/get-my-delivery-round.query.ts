/** Ma tournée — `staffUserId` est la fiche de la requête, jamais un paramètre d'URL. */
export class GetMyDeliveryRoundQuery {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
  ) {}
}
