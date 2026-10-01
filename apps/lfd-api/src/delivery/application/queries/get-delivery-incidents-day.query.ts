/** Les signalements d'une journée (`plan-a-la-porte.md`, § 3), pour l'admin. */
export class GetDeliveryIncidentsDayQuery {
  constructor(readonly day: string) {}
}
