/** La photo d'un signalement à décider, pour le commercial (`a-la-porte.md`, B3). */
export class GetDecisionIncidentPhotoQuery {
  constructor(
    readonly stopId: string,
    readonly incidentId: string,
  ) {}
}
