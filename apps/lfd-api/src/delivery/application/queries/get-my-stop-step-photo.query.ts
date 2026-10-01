/**
 * La photo d'une étape de procédure d'un arrêt de MA tournée — `staffUserId`
 * est la fiche de la requête, jamais un paramètre d'URL.
 */
export class GetMyStopStepPhotoQuery {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly stopId: string,
    readonly stepId: string,
  ) {}
}
