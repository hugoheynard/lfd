/** Les signalements d'une journée (`a-la-porte.md`, § 3), pour l'admin. */
export class GetDeliveryIncidentsDayQuery {
  constructor(readonly day: string) {}
}
