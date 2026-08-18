/** Les créneaux réservables d'une fenêtre de jours locaux (`AAAA-MM-JJ`). */
export class GetSlotsQuery {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {}
}
