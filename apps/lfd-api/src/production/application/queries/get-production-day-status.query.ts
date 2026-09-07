/** L'état d'une journée de fabrication, telle que le fournil la lit. */
export class GetProductionDayStatusQuery {
  constructor(readonly serviceDay: string) {}
}
