/** Le poste de colisage d'une journée, servi par le colisage (K3a). */
export class GetPackingBoardQuery {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
  ) {}
}
