/** Les rendez-vous **à venir** du demandeur (les siens et ceux de ses sociétés). */
export class ListMyAppointmentsQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyIds: readonly string[],
  ) {}
}
