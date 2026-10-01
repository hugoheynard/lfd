/** La photo d'un signalement de MA tournée — `staffUserId` est le mur. */
export class GetMyIncidentPhotoQuery {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
    readonly incidentId: string,
  ) {}
}
