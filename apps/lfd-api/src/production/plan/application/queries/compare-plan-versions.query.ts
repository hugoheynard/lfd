/** Ce qui a changé au plan d'une journée de la version `from` à la version `to`. */
export class ComparePlanVersionsQuery {
  constructor(
    readonly serviceDay: string,
    readonly from: number,
    readonly to: number,
  ) {}
}
