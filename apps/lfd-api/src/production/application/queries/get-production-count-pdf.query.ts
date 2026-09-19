/** Le compte à produire d'une journée, en PDF. */
export class GetProductionCountPdfQuery {
  constructor(readonly serviceDay: string) {}
}
