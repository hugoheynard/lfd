/** La photo d'un signalement, pour l'admin (sous `delivery_rounds:read`). */
export class GetIncidentPhotoQuery {
  constructor(readonly incidentId: string) {}
}
