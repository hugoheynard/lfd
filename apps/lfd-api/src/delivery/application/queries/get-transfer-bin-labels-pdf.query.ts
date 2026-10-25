/** Les étiquettes des bacs d'un transfert interne, en PDF A6 (2026-10-25). */
export class GetTransferBinLabelsPdfQuery {
  constructor(
    readonly transferId: string,
    /** Les bacs à imprimer (`?bacs=`) ; vide : tous les bacs vivants. */
    readonly binIds: readonly string[],
  ) {}
}
