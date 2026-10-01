/** Mes tournées d'un jour — `staffUserId` est la fiche de la requête, jamais un paramètre d'URL. */
export class GetMyDeliveryRoundsQuery {
  constructor(
    readonly staffUserId: string,
    readonly date: string,
  ) {}
}
